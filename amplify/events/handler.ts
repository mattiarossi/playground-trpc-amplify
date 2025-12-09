import { Logger } from '@aws-lambda-powertools/logger';
import { AppSyncEventsResolver } from '@aws-lambda-powertools/event-handler/appsync-events';
import type {
  AppSyncEventsSubscribeEvent,
  AppSyncEventsPublishEvent,
} from '@aws-lambda-powertools/event-handler/types';
import type { Context } from 'aws-lambda';
import { appRouter } from '../../src/server/trpc/routers';
import { createTRPCContext } from '../../src/server/trpc/trpc';
import { TRPCError } from '@trpc/server';
import { getHTTPStatusCodeFromError } from '@trpc/server/http';
import superjson from 'superjson';
import {
  DrizzleChunkStore,
  chunkMessage,
  needsChunking,
  type ChunkedMessage,
} from './chunking-utils';


// Initialize Logger
const logger = new Logger({ serviceName: 'appsync-events-handler' });

// Initialize PostgreSQL chunk store
const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  throw new Error('DATABASE_URL environment variable is required');
}
const chunkStore = new DrizzleChunkStore(DATABASE_URL);

// Initialize AppSync Events Resolver
const resolver = new AppSyncEventsResolver({ logger });

/**
 * Handle SUBSCRIBE operation
 * Clients subscribe to a channel to receive tRPC responses
 */
resolver.onSubscribe('/*', async (event: AppSyncEventsSubscribeEvent) => {
  logger.info('Client subscribing to channel', {
    channelPath: event.info.channel.path,
    identity: event.identity,
  });

  // For subscribe events, we simply acknowledge the subscription
  // The client will start receiving published events after this
  logger.info('Subscription confirmed for channel', {
    channel: event.info.channel.path,
  });

  // Return empty or success - subscription is automatically handled by AppSync
  return {};
});

/**
 * Handle PUBLISH operation
 * Process tRPC requests and return responses, with support for chunked messages
 */
resolver.onPublish('/*', async (payload: any, event: AppSyncEventsPublishEvent) => {
  logger.info('Processing message', {
    channelPath: event.info.channel.path,
    identity: event.identity,
    isChunked: payload.isChunked || false,
    isChunkRequest: payload.isChunkRequest || false,
    type: payload.type,
  });

  // Check if this is a chunk fetch request (compact format)
  if (payload.type === 'chunk_req') {
    return await handleChunkRequest(
      { messageId: payload.mid, chunkIndex: payload.idx },
      event
    );
  }
  
  // Check if this is a chunk fetch request (legacy format)
  if (payload.isChunkRequest) {
    return await handleChunkRequest(payload, event);
  }

  // Check if this is a chunked message
  if (payload.isChunked) {
    return await handleChunkedMessage(payload as ChunkedMessage, event);
  }

  // Extract tRPC request from the payload
  const trpcRequest = payload;
  logger.info('tRPC Request details', {
    id: trpcRequest.id,
    type: trpcRequest.trpcType,
    path: trpcRequest.path,
  });

  // Process tRPC request
  const result = await processTRPCRequest(trpcRequest, event);

  // Check if result needs chunking before sending back
  if (needsChunking(result)) {
    logger.info('Response needs chunking', {
      requestId: trpcRequest.id,
    });
    const chunks = chunkMessage(result);
    logger.info(`Split response into ${chunks.length} chunks`);
    
    // Return metadata first, then return chunks individually
    // This avoids the 240KB limit by splitting the response
    const responseMessageId = chunks[0].messageId;
    
    // Store chunks temporarily for fallback retrieval
    for (const chunk of chunks) {
      await chunkStore.storeChunk(chunk);
    }
    
    logger.info('Returning chunked response with all chunks inline', {
      totalChunks: chunks.length,
      messageId: responseMessageId,
    });
    
    // Return first chunk immediately, client will request others
    return {
      isChunkedResponse: true,
      messageId: responseMessageId,
      totalChunks: chunks.length,
      requestId: trpcRequest.id,
      firstChunk: chunks[0], // Include first chunk to start processing
    };
  }

  // Return the result - it will be broadcast to subscribers
  return result;
});

/**
 * Export the Lambda handler
 */
export const handler = async (event: unknown, context: Context) =>
  resolver.resolve(event, context);

/**
 * Handle chunk fetch request
 * Retrieve a specific chunk from PostgreSQL
 */
async function handleChunkRequest(
  payload: { messageId: string; chunkIndex: number },
  lambdaEvent: AppSyncEventsPublishEvent
): Promise<any> {
  const { messageId, chunkIndex } = payload;
  
  logger.info('Fetching chunk', {
    messageId,
    chunkIndex,
  });
  
  try {
    // Retrieve all chunks for this message
    const chunks = await chunkStore.getChunks(messageId);
    
    if (chunks.length === 0) {
      throw new Error(`No chunks found for message ${messageId}`);
    }
    
    // Find the specific chunk
    const chunk = chunks.find(c => c.chunkIndex === chunkIndex);
    
    if (!chunk) {
      throw new Error(`Chunk ${chunkIndex} not found for message ${messageId}`);
    }
    
    logger.info('Chunk retrieved successfully', {
      messageId,
      chunkIndex,
    });
    
    return chunk;
  } catch (error) {
    logger.error('Error fetching chunk', {
      error: error instanceof Error ? error.message : 'Unknown error',
      messageId,
      chunkIndex,
    });
    throw error;
  }
}

/**
 * Handle incoming chunked message
 * Store chunk in PostgreSQL and reassemble when all chunks are received
 */
async function handleChunkedMessage(
  chunk: ChunkedMessage,
  lambdaEvent: AppSyncEventsPublishEvent
): Promise<any> {
  const { messageId, chunkIndex, totalChunks } = chunk;
  
  logger.info('Received chunk', {
    messageId,
    chunkIndex,
    totalChunks,
  });
  
  try {
    // Store chunk in PostgreSQL
    await chunkStore.storeChunk(chunk);
    
    // Check if we have all chunks
    const hasAll = await chunkStore.hasAllChunks(messageId, totalChunks);
    
    if (hasAll) {
      logger.info('All chunks received, reassembling message', { messageId });
      
      // Retrieve all chunks
      const chunks = await chunkStore.getChunks(messageId);
      
      // Reassemble the message
      const { reassembleChunks } = await import('./chunking-utils');
      const completeMessage = reassembleChunks(chunks);
      
      logger.info('Message reassembled successfully', {
        messageId,
        requestId: completeMessage.id,
      });
      
      // Clean up chunks from PostgreSQL
      await chunkStore.deleteChunks(messageId);
      
      // Process the complete tRPC request
      const result = await processTRPCRequest(completeMessage, lambdaEvent);
      
      // Check if result needs chunking
      if (needsChunking(result)) {
        logger.info('Response needs chunking', {
          requestId: completeMessage.id,
        });
        const responseChunks = chunkMessage(result);
        logger.info(`Split response into ${responseChunks.length} chunks`);
        
        // Store chunks in PostgreSQL
        const responseMessageId = responseChunks[0].messageId;
        for (const chunk of responseChunks) {
          await chunkStore.storeChunk(chunk);
        }
        
        // Return only metadata (no auth headers needed on response)
        return {
          isChunkedResponse: true,
          messageId: responseMessageId,
          totalChunks: responseChunks.length,
          requestId: completeMessage.id,
        };
      }
      
      return result;
    }
    
    // Not all chunks received yet, return acknowledgment
    logger.info('Waiting for more chunks', {
      messageId,
      received: chunkIndex + 1,
      total: totalChunks,
    });
    
    return {
      acknowledged: true,
      messageId,
      chunkIndex,
    };
  } catch (error) {
    logger.error('Error handling chunked message', {
      error: error instanceof Error ? error.message : 'Unknown error',
      messageId,
      chunkIndex,
    });
    
    // Clean up on error
    try {
      await chunkStore.deleteChunks(messageId);
    } catch (cleanupError) {
      logger.error('Error cleaning up chunks', {
        error: cleanupError instanceof Error ? cleanupError.message : 'Unknown error',
        messageId,
      });
    }
    
    throw error;
  }
}

/**
 * Process tRPC request within the Lambda function
 * This function is called for each published message and handles tRPC routing
 */
async function processTRPCRequest(message: any, lambdaEvent: AppSyncEventsPublishEvent) {
  const { id, path, input, trpcType } = message;

  try {
    // Log identity information for debugging
    logger.info('Lambda event identity', {
      hasIdentity: !!lambdaEvent.identity,
      identity: lambdaEvent.identity,
      identityKeys: lambdaEvent.identity ? Object.keys(lambdaEvent.identity) : [],
    });

    // Create tRPC context with user info from identity
    const identity = lambdaEvent.identity as any;
    const ctx = await createTRPCContext({
      headers: new Headers(lambdaEvent.request.headers || {}),
      user: identity
        ? {
            sub: identity.sub,
            username: identity.username,
            email: identity.claims?.email,
            groups: identity.claims?.['cognito:groups'] || [],
          }
        : undefined,
    });

    // Log the extracted user context
    logger.info('Created tRPC context', {
      hasUser: !!ctx.user,
      userSub: ctx.user?.sub,
      username: ctx.user?.username,
      email: ctx.user?.email,
      groups: ctx.user?.groups,
    });

    // Create a caller for the router
    const caller = appRouter.createCaller(ctx);

    // Route the request based on path and type
    let result;

    // Parse the path (e.g., "posts.list" -> ["posts", "list"])
    const [router, procedure] = path.split('.');

    if (!router || !procedure) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: `Invalid tRPC path: ${path}`,
      });
    }

    // Deserialize input using superjson
    // Input comes in the superjson format: { json: data, meta: metadata }
    const actualInput = input?.json !== undefined ? superjson.deserialize(input) : input;

    // Execute the procedure
    if (trpcType === 'query') {
      result = await (caller as any)[router][procedure](actualInput);
    } else if (trpcType === 'mutation') {
      result = await (caller as any)[router][procedure](actualInput);
    } else if (trpcType === 'subscription') {
      // For tRPC subscriptions in serverless AppSync Events:
      // The subscription observables use EventEmitter which is in-memory per Lambda execution.
      // This means subscriptions won't work across different clients or Lambda instances.
      // 
      // For true real-time updates in serverless, we acknowledge the subscription
      // and rely on the client-side polling/refetch approach.
      // 
      // A production solution would require:
      // - DynamoDB for subscription state
      // - EventBridge or SNS for cross-Lambda communication
      // - Or use AppSync GraphQL subscriptions instead
      
      logger.info('Subscription acknowledged (serverless limitation)', {
        path,
        input: actualInput,
        requestId: id,
      });
      
      // Return acknowledgment
      return {
        id,
        result: {
          type: 'started',
          data: superjson.serialize({ subscribed: true }),
        },
      };
    } else {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: `Unknown request type: ${trpcType}`,
      });
    }

    // Serialize result using superjson
    const serializedResult = superjson.serialize(result);

    // Return successful tRPC response
    return {
      id,
      result: {
        type: 'data',
        data: serializedResult,
      },
    };
  } catch (error) {
    // Log the full error object for debugging
    logger.error('tRPC Error occurred', {
      error: error instanceof Error ? error.message : 'Unknown error',
      errorStack: error instanceof Error ? error.stack : undefined,
      errorName: error instanceof Error ? error.name : undefined,
      errorCause: (error as any)?.cause,
      fullError: JSON.stringify(error, Object.getOwnPropertyNames(error)),
      path,
    });

    // Handle tRPC errors
    if (error instanceof TRPCError) {
      const httpCode = getHTTPStatusCodeFromError(error);
      
      // Extract underlying error details if available
      const causeMessage = error.cause instanceof Error ? error.cause.message : undefined;
      
      return {
        id,
        error: {
          message: error.message,
          code: error.code,
          data: {
            httpStatus: httpCode,
            path,
            causeMessage,
          },
        },
      };
    }

    // Handle unknown errors
    return {
      id,
      error: {
        message: error instanceof Error ? error.message : 'Unknown error',
        code: 'INTERNAL_SERVER_ERROR',
        data: {
          httpStatus: 500,
          path,
        },
      },
    };
  }
}
