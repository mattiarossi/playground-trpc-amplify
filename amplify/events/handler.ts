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

// Initialize Logger
const logger = new Logger({ serviceName: 'appsync-events-handler' });

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
 * Process tRPC requests and return responses
 */
resolver.onPublish('/*', async (payload: any, event: AppSyncEventsPublishEvent) => {
  logger.info('Processing tRPC message', {
    channelPath: event.info.channel.path,
    identity: event.identity,
  });

  // Extract tRPC request from the payload
  const trpcRequest = payload;
  logger.info('tRPC Request details', {
    id: trpcRequest.id,
    type: trpcRequest.trpcType,
    path: trpcRequest.path,
  });

  // Process tRPC request
  const result = await processTRPCRequest(trpcRequest, event);

  // Return the result - it will be broadcast to subscribers
  return result;
});

/**
 * Export the Lambda handler
 */
export const handler = async (event: unknown, context: Context) =>
  resolver.resolve(event, context);

/**
 * Process tRPC request within the Lambda function
 * This function is called for each published message and handles tRPC routing
 */
async function processTRPCRequest(message: any, lambdaEvent: AppSyncEventsPublishEvent) {
  const { id, path, input, trpcType } = message;

  try {
    // Create tRPC context with user info from identity
    const ctx = await createTRPCContext({
      headers: new Headers(lambdaEvent.request.headers || {}),
      user: lambdaEvent.identity
        ? {
            sub: (lambdaEvent.identity as any).sub,
            username: (lambdaEvent.identity as any).username,
            email: (lambdaEvent.identity as any).claims?.email,
          }
        : undefined,
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
      // Subscriptions would require additional WebSocket management
      throw new TRPCError({
        code: 'METHOD_NOT_SUPPORTED',
        message: 'Subscriptions not yet implemented',
      });
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
