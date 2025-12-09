import type { TRPCLink } from '@trpc/client';
import { observable } from '@trpc/server/observable';
import { TRPCClientError } from '@trpc/client';
import type { AnyRouter } from '@trpc/server';
import {
  ChunkStore,
  needsChunking,
  chunkMessage,
  type ChunkedMessage,
  type MessagePayload,
} from './chunking-utils';

/**
 * Custom WebSocket tRPC link for AppSync Events API with automatic message chunking
 * This adapter bridges tRPC over AppSync Events WebSocket instead of HTTP
 * Handles AppSync's 240KB message size limit transparently via chunking
 */
export interface WebSocketLinkOptions {
  url: string;
  httpEndpoint: string; // Required for auth header
  getAuthToken?: () => Promise<string | undefined>;
  connectionParams?: Record<string, any>;
  transformer?: {
    serialize: (object: any) => any;
    deserialize: (object: any) => any;
  };
}

interface PendingRequest {
  resolve: (data: any) => void;
  reject: (error: any) => void;
  observer?: any; // For subscriptions
  isSubscription?: boolean;
  path?: string; // Subscription path for filtering
  input?: any; // Subscription input for filtering
}

interface ChunkFetchRequest {
  messageId: string;
  totalChunks: number;
  requestId: string;
  chunks: Map<number, ChunkedMessage>;
  resolve: (data: any) => void;
  reject: (error: any) => void;
  timeout: NodeJS.Timeout;
}

export class AppSyncWebSocketLink {
  private ws: WebSocket | null = null;
  private pendingRequests = new Map<string, PendingRequest>();
  private pendingChunkFetches = new Map<string, ChunkFetchRequest>(); // Track chunk fetches
  private reconnectTimeout: NodeJS.Timeout | null = null;
  private isConnecting = false;
  private isConnected = false;
  private isSubscribed = false;
  private messageQueue: any[] = [];
  private sessionId: string; // Unique session ID for this client instance
  private channelName: string; // AppSync Events channel name - unique per client
  private keepAliveTimeout: NodeJS.Timeout | null = null;
  private connectionTimeoutMs = 300000; // 5 minutes default
  private subscriptionId: string | null = null; // Track subscription ID per connection
  private subscriptionCounter = 0; // Counter for unique subscription IDs
  private chunkStore = new ChunkStore(); // Store for reassembling incoming chunks
  private currentAuthHeader: Record<string, string> = {}; // Store current auth header
  private subscriptionChannels = new Map<string, Set<string>>(); // Track subscribed channels and their handler IDs
  private channelHandlers = new Map<string, (data: any) => void>(); // Handlers for non-tRPC channels
  private subscriptionIdToChannel = new Map<string, string>(); // Map subscription IDs to channel names

  constructor(private options: WebSocketLinkOptions) {
    // Generate unique session ID for this client instance
    // This ensures each browser tab/window gets its own dedicated channel
    this.sessionId = crypto.randomUUID();
    this.channelName = `trpc/${this.sessionId}`;
  }

  private getBase64URLEncoded(authorization: Record<string, string>): string {
    const json = JSON.stringify(authorization);
    // Use btoa for browser, or Buffer for Node.js
    const base64 = typeof btoa !== 'undefined' 
      ? btoa(json)
      : Buffer.from(json).toString('base64');
    
    return base64
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
  }

  private resetKeepAliveTimeout() {
    if (this.keepAliveTimeout) {
      clearTimeout(this.keepAliveTimeout);
    }
    
    this.keepAliveTimeout = setTimeout(() => {
      this.ws?.close();
    }, this.connectionTimeoutMs);
  }

  private connect(): Promise<WebSocket> {
    if (this.ws?.readyState === WebSocket.OPEN && this.isConnected) {
      return Promise.resolve(this.ws);
    }

    if (this.isConnecting) {
      return new Promise((resolve) => {
        const checkConnection = setInterval(() => {
          if (this.ws?.readyState === WebSocket.OPEN && this.isConnected) {
            clearInterval(checkConnection);
            resolve(this.ws);
          }
        }, 100);
      });
    }

    this.isConnecting = true;
    this.isConnected = false;
    this.isSubscribed = false;

    return new Promise(async (resolve, reject) => {
      try {
        // Extract host from HTTP endpoint (without protocol)
        const httpHost = new URL(this.options.httpEndpoint).host;
        
        // Build authorization header
        const authHeader: Record<string, string> = {
          host: httpHost,
        };

        // Add Cognito auth token if available
        if (this.options.getAuthToken) {
          const token = await this.options.getAuthToken();
          if (token) {
            authHeader.Authorization = token;
          }
        }

        // Store auth header for later use
        this.currentAuthHeader = authHeader;
        
        // Encode authorization as base64URL
        const encodedAuth = this.getBase64URLEncoded(authHeader);
        
        // Create WebSocket with required subprotocols
        const subprotocols = [
          `header-${encodedAuth}`,
          'aws-appsync-event-ws'
        ];

        this.ws = new WebSocket(this.options.url, subprotocols);

        this.ws.onopen = () => {
          // Send connection_init message
          this.ws?.send(JSON.stringify({ type: 'connection_init' }));
        };

        this.ws.onmessage = (event) => {
          try {
            const response = JSON.parse(event.data);

            // Handle connection_ack
            if (response.type === 'connection_ack') {
              this.isConnecting = false;
              this.isConnected = true;
              this.connectionTimeoutMs = response.connectionTimeoutMs || 300000;
              this.resetKeepAliveTimeout();
              
              // Now subscribe to the tRPC channel
              this.subscribeToChannel(authHeader);
              resolve(this.ws!);
              return;
            }

            // Handle keep-alive messages
            if (response.type === 'ka') {
              this.resetKeepAliveTimeout();
              return;
            }

            // Handle subscribe_success
            if (response.type === 'subscribe_success') {
              // Verify the subscription ID matches what we sent
              if (response.id === this.subscriptionId) {
                this.isSubscribed = true;
                
                // Send any queued messages
                while (this.messageQueue.length > 0) {
                  const msg = this.messageQueue.shift();
                  this.ws?.send(JSON.stringify(msg));
                }
              }
              return;
            }

            // Handle subscribe_error
            if (response.type === 'subscribe_error') {
              // Reset subscription state on error
              this.isSubscribed = false;
              this.subscriptionId = null;
              return;
            }

            // Handle data events (tRPC responses and subscription events)
            if (response.type === 'data' && response.event) {
              const eventData = JSON.parse(response.event);
              
              // Determine which channel this message is for
              // For data messages, we need to check the subscription ID
              const channelName = response.id ? this.subscriptionIdToChannel.get(response.id) : null;
              
              // Check if this is an event for a subscribed channel (not tRPC)
              // Additional channels emit raw data that we forward to handlers
              if (channelName && channelName !== this.channelName) {
                const handlers = this.subscriptionChannels.get(channelName);
                if (handlers) {
                  for (const handlerId of handlers) {
                    const handler = this.channelHandlers.get(handlerId);
                    if (handler) {
                      try {
                        handler(eventData);
                      } catch (error) {
                        console.error(`[AppSync] Error in channel handler:`, error);
                      }
                    }
                  }
                }
                return;
              }
              
              // Check if this is a chunk response
              if (eventData.isChunked && eventData.messageId && eventData.chunkIndex !== undefined) {
                this.handleIncomingChunk(eventData as ChunkedMessage);
                return;
              }
              
              // Check if this is a chunked response from server
              if (eventData.isChunkedResponse) {
                // Only process if we have a pending request for this response
                // (chunked responses are broadcast, so other clients may see them)
                if (!this.pendingRequests.has(eventData.requestId)) {
                  return;
                }
                
                // Start fetching chunks (if first chunk provided, process it first)
                this.startFetchingChunks(
                  eventData.messageId,
                  eventData.totalChunks,
                  eventData.requestId,
                  eventData.firstChunk
                );
                return;
              }
              
              // Check if this is a subscription event broadcast
              if (eventData.subscriptionPath) {
                // This is a broadcasted subscription event
                // Find all matching subscriptions and emit to them
                for (const [reqId, request] of this.pendingRequests.entries()) {
                  if (request.isSubscription && 
                      request.path === eventData.subscriptionPath &&
                      request.observer) {
                    
                    // Check if subscription input matches (for filtering)
                    const inputMatches = this.subscriptionInputMatches(
                      request.input,
                      eventData.subscriptionInput
                    );
                    
                    if (inputMatches && eventData.result) {
                      const serializedData = eventData.result.data;
                      const data = this.options.transformer 
                        ? this.options.transformer.deserialize(serializedData)
                        : serializedData;
                      
                      request.observer.next({ result: { type: 'data' as const, data } });
                    }
                  }
                }
                return;
              }
              
              if (eventData.id && this.pendingRequests.has(eventData.id)) {
                const request = this.pendingRequests.get(eventData.id)!;
                
                if (eventData.error) {
                  request.reject(
                    new TRPCClientError(eventData.error.message, {
                      cause: eventData.error,
                    })
                  );
                  this.pendingRequests.delete(eventData.id);
                } else if (eventData.result) {
                  // Response has result.data structure
                  // Deserialize using superjson if transformer is configured
                  const serializedData = eventData.result.data;
                  const data = this.options.transformer 
                    ? this.options.transformer.deserialize(serializedData)
                    : serializedData;
                  
                  // For subscriptions, this is the acknowledgment
                  if (request.isSubscription) {
                    // Just acknowledge, don't emit data yet
                    request.resolve(data);
                    // Keep subscription in pendingRequests for future events
                  } else {
                    // For queries/mutations, resolve and complete
                    request.resolve(data);
                    this.pendingRequests.delete(eventData.id);
                  }
                } else {
                  // This might be the original request being echoed back, not the response
                  // Don't resolve or reject yet - wait for actual response
                  return;
                }
              }
              return;
            }

            // Handle publish_success
            if (response.type === 'publish_success') {
              return;
            }

            // Handle publish_error
            if (response.type === 'publish_error') {
              return;
            }

          } catch (error) {
            // Error parsing WebSocket message
          }
        };

        this.ws.onerror = (error) => {
          this.isConnecting = false;
          this.isConnected = false;
          reject(error);
        };

        this.ws.onclose = () => {
          this.isConnecting = false;
          this.isConnected = false;
          this.isSubscribed = false;
          this.subscriptionId = null; // Reset subscription ID on disconnect
          this.ws = null;
          
          if (this.keepAliveTimeout) {
            clearTimeout(this.keepAliveTimeout);
          }
          
          // Attempt to reconnect after 3 seconds
          this.reconnectTimeout = setTimeout(() => {
            this.connect().catch(() => {});
          }, 3000);
        };
      } catch (error) {
        this.isConnecting = false;
        this.isConnected = false;
        reject(error);
      }
    });
  }

  private async subscribeToChannel(authHeader: Record<string, string>) {
    // Generate unique subscription ID per connection
    // AppSync requires this ID to be unique per client connection
    this.subscriptionCounter++;
    this.subscriptionId = `sub-${Date.now()}-${this.subscriptionCounter}`;
    
    // Use the same authorization object that was used for the WebSocket connection
    // This includes host and Authorization token (if using Cognito)
    const subscribeMessage = {
      type: 'subscribe',
      id: this.subscriptionId,
      channel: this.channelName,
      authorization: authHeader,
    };
    
    this.ws?.send(JSON.stringify(subscribeMessage));
  }

  /**
   * Start fetching chunks from the server
   */
  private startFetchingChunks(
    messageId: string,
    totalChunks: number,
    requestId: string,
    firstChunk?: ChunkedMessage
  ): void {
    // Get the pending request (should always exist since we check before calling)
    const pendingRequest = this.pendingRequests.get(requestId);
    if (!pendingRequest) {
      console.error('Unexpected: No pending request found in startFetchingChunks:', requestId);
      return;
    }
    
    // Create a chunk fetch request
    const timeout = setTimeout(() => {
      const chunkFetch = this.pendingChunkFetches.get(messageId);
      if (chunkFetch) {
        chunkFetch.reject(new Error('Timeout fetching chunks'));
        this.pendingChunkFetches.delete(messageId);
      }
    }, 30000); // 30 second timeout
    
    const chunks = new Map<number, ChunkedMessage>();
    
    // If first chunk provided, add it
    if (firstChunk) {
      chunks.set(firstChunk.chunkIndex, firstChunk);
    }
    
    this.pendingChunkFetches.set(messageId, {
      messageId,
      totalChunks,
      requestId,
      chunks,
      resolve: pendingRequest.resolve,
      reject: pendingRequest.reject,
      timeout,
    });
    
    // Request remaining chunks (skip first if already provided)
    const startIndex = firstChunk ? 1 : 0;
    for (let i = startIndex; i < totalChunks; i++) {
      const chunkRequest = {
        type: 'chunk_req',
        mid: messageId,
        idx: i,
      };
      
      const publishMessage = {
        type: 'publish',
        id: `pub-${Math.random().toString(36).substring(7)}`,
        channel: this.channelName,
        events: [JSON.stringify(chunkRequest)],
        authorization: this.currentAuthHeader,
      };
      
      this.ws?.send(JSON.stringify(publishMessage));
    }
    
    // If we only have one chunk and it's already provided, process immediately
    if (totalChunks === 1 && firstChunk) {
      this.handleIncomingChunk(firstChunk);
    }
  }

  /**
   * Handle an incoming chunk
   */
  private handleIncomingChunk(chunk: ChunkedMessage): void {
    const chunkFetch = this.pendingChunkFetches.get(chunk.messageId);
    if (!chunkFetch) {
      console.warn('Received chunk for unknown message:', chunk.messageId);
      return;
    }
    
    // Store the chunk
    chunkFetch.chunks.set(chunk.chunkIndex, chunk);
    
    // Check if we have all chunks
    if (chunkFetch.chunks.size === chunkFetch.totalChunks) {
      
      // Clear timeout
      clearTimeout(chunkFetch.timeout);
      
      // Convert map to array
      const chunks: ChunkedMessage[] = [];
      for (let i = 0; i < chunkFetch.totalChunks; i++) {
        const chunkItem = chunkFetch.chunks.get(i);
        if (!chunkItem) {
          chunkFetch.reject(new Error(`Missing chunk ${i}`));
          this.pendingChunkFetches.delete(chunkFetch.messageId);
          this.pendingRequests.delete(chunkFetch.requestId);
          return;
        }
        chunks.push(chunkItem);
      }
      
      // Reassemble the message
      try {
        const { reassembleChunks } = require('./chunking-utils');
        const completeMessage = reassembleChunks(chunks);
        
        if (completeMessage.error) {
          chunkFetch.reject(
            new TRPCClientError(completeMessage.error.message, {
              cause: completeMessage.error,
            })
          );
        } else if (completeMessage.result) {
          const serializedData = completeMessage.result.data;
          const data = this.options.transformer
            ? this.options.transformer.deserialize(serializedData)
            : serializedData;
          chunkFetch.resolve(data);
        }
      } catch (error) {
        chunkFetch.reject(error);
      } finally {
        // Cleanup
        this.pendingChunkFetches.delete(chunk.messageId);
        this.pendingRequests.delete(chunkFetch.requestId);
      }
    }
  }

  /**
   * Handle incoming chunked response
   */
  /**
   * Check if subscription input matches for filtering events
   */
  private subscriptionInputMatches(requestInput: any, eventInput: any): boolean {
    // Simple deep equality check for subscription input
    // This ensures clients only receive events they subscribed to
    if (!requestInput && !eventInput) return true;
    if (!requestInput || !eventInput) return false;
    
    try {
      return JSON.stringify(requestInput) === JSON.stringify(eventInput);
    } catch {
      return false;
    }
  }

  /**
   * Handle incoming chunked response
   */
  private handleChunkedResponse(chunk: ChunkedMessage): void {
    // Add chunk to store and check if message is complete
    const completeMessage = this.chunkStore.addChunk(chunk);
    
    if (completeMessage) {
      
      // Process the complete message
      if (completeMessage.id && this.pendingRequests.has(completeMessage.id)) {
        const request = this.pendingRequests.get(completeMessage.id)!;
        
        if (completeMessage.error) {
          request.reject(
            new TRPCClientError(completeMessage.error.message, {
              cause: completeMessage.error,
            })
          );
        } else if (completeMessage.result) {
          const serializedData = completeMessage.result.data;
          const data = this.options.transformer
            ? this.options.transformer.deserialize(serializedData)
            : serializedData;
          request.resolve(data);
        }
        
        this.pendingRequests.delete(completeMessage.id);
      }
    }
  }

  public async request(operation: {
    type: 'query' | 'mutation' | 'subscription';
    path: string;
    input: any;
    observer?: any; // For subscriptions
  }): Promise<any> {
    const ws = await this.connect();

    return new Promise(async (resolve, reject) => {
      const id = `req-${Math.random().toString(36).substring(7)}`;

      // Create event payload
      // Serialize input using superjson if transformer is configured
      const serializedInput = this.options.transformer
        ? this.options.transformer.serialize(operation.input)
        : operation.input;
      
      const eventPayload = {
        id,
        trpcType: operation.type,
        path: operation.path,
        input: serializedInput,
        context: this.options.connectionParams,
        sessionId: this.sessionId, // Include session ID for server-side logging/debugging
      };

      this.pendingRequests.set(id, { 
        resolve, 
        reject, 
        observer: operation.observer,
        isSubscription: operation.type === 'subscription',
        path: operation.path,
        input: operation.input,
      });
      
      // Check if message needs chunking
      if (needsChunking(eventPayload)) {
        const chunks = chunkMessage(eventPayload);
        
        // Send each chunk as a separate message
        for (const chunk of chunks) {
          const publishMessage = {
            type: 'publish',
            id: `pub-${Math.random().toString(36).substring(7)}`,
            channel: this.channelName,
            events: [JSON.stringify(chunk)],
            authorization: this.currentAuthHeader,
          };
          
          if (ws.readyState === WebSocket.OPEN && this.isSubscribed) {
            ws.send(JSON.stringify(publishMessage));
          } else {
            this.messageQueue.push(publishMessage);
          }
        }
      } else {
        // Send as normal single message
        const publishMessage = {
          type: 'publish',
          id: `pub-${Math.random().toString(36).substring(7)}`,
          channel: this.channelName,
          events: [JSON.stringify(eventPayload)],
          authorization: this.currentAuthHeader,
        };
        
        if (ws.readyState === WebSocket.OPEN && this.isSubscribed) {
          ws.send(JSON.stringify(publishMessage));
        } else {
          this.messageQueue.push(publishMessage);
        }
      }

      // Set timeout for request
      setTimeout(() => {
        if (this.pendingRequests.has(id)) {
          this.pendingRequests.delete(id);
          reject(new Error('Request timeout'));
        }
      }, 30000); // 30 second timeout
    });
  }

  public close() {
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
    }
    if (this.keepAliveTimeout) {
      clearTimeout(this.keepAliveTimeout);
    }
    
    // Clear chunk store
    this.chunkStore.clear();
    
    // Unsubscribe before closing if we have an active subscription
    if (this.ws?.readyState === WebSocket.OPEN && this.subscriptionId) {
      const unsubscribeMessage = {
        type: 'unsubscribe',
        id: this.subscriptionId,
      };
      this.ws.send(JSON.stringify(unsubscribeMessage));
    }
    
    this.ws?.close();
    this.ws = null;
    this.isConnected = false;
    this.isSubscribed = false;
    this.subscriptionId = null;
  }

  /**
   * Subscribe to an additional channel (e.g., subscriptions/users)
   * This allows using the same WebSocket connection for non-tRPC pub/sub
   */
  public async subscribeToAdditionalChannel(
    channel: string,
    handler: (data: any) => void
  ): Promise<string> {
    // Ensure we're connected
    await this.connect();

    // Generate unique handler ID
    const handlerId = `handler-${Math.random().toString(36).substring(7)}`;

    // Store the handler
    this.channelHandlers.set(handlerId, handler);

    // Track which handlers are subscribed to which channels
    if (!this.subscriptionChannels.has(channel)) {
      this.subscriptionChannels.set(channel, new Set());

      // Subscribe to this channel
      const subscriptionCounter = ++this.subscriptionCounter;
      const subscriptionId = `sub-${Date.now()}-${subscriptionCounter}`;
      
      // Track the mapping from subscription ID to channel name
      this.subscriptionIdToChannel.set(subscriptionId, channel);

      const subscribeMessage = {
        type: 'subscribe',
        id: subscriptionId,
        channel: channel,
        authorization: this.currentAuthHeader,
      };

      this.ws?.send(JSON.stringify(subscribeMessage));
    }

    this.subscriptionChannels.get(channel)!.add(handlerId);
    return handlerId;
  }

  /**
   * Unsubscribe from an additional channel
   */
  public unsubscribeFromAdditionalChannel(channel: string, handlerId: string): void {
    const handlers = this.subscriptionChannels.get(channel);
    if (handlers) {
      handlers.delete(handlerId);
      this.channelHandlers.delete(handlerId);

      // If no more handlers for this channel, unsubscribe
      if (handlers.size === 0) {
        this.subscriptionChannels.delete(channel);
        // Could send unsubscribe message here if needed
      }
    }
  }

  /**
   * Publish a message to a channel
   */
  public async publishToChannel(channel: string, data: any): Promise<void> {
    await this.connect();

    const publishMessage = {
      type: 'publish',
      id: `pub-${Math.random().toString(36).substring(7)}`,
      channel: channel,
      events: [JSON.stringify(data)],
      authorization: this.currentAuthHeader,
    };

    this.ws?.send(JSON.stringify(publishMessage));
  }
}

// Singleton instance for sharing WebSocket connection
let sharedWsLink: AppSyncWebSocketLink | null = null;

export function getSharedWebSocketLink(): AppSyncWebSocketLink | null {
  return sharedWsLink;
}

/**
 * Create tRPC link for AppSync Events WebSocket
 */

export function createAppSyncWebSocketLink<TRouter extends AnyRouter>(
  options: WebSocketLinkOptions
): TRPCLink<TRouter> {
  const wsLink = new AppSyncWebSocketLink(options);
  
  // Store as shared instance for use by subscription system
  sharedWsLink = wsLink;

  return () => {
    return ({ op, next }) => {
      return observable((observer) => {
        const { type, path, input } = op;

        if (type === 'subscription') {
          // For subscriptions, pass the observer and don't complete
          wsLink
            .request({
              type: 'subscription',
              path,
              input,
              observer,
            })
            .then((data) => {
              // Initial subscription confirmation
              // Don't complete - let the subscription stay open
            })
            .catch((error) => {
              observer.error(error);
            });
          
          // Return cleanup function
          return () => {
            // Could send unsubscribe message here
          };
        } else {
          // For queries and mutations, complete after response
          wsLink
            .request({
              type: type as 'query' | 'mutation' | 'subscription',
              path,
              input,
            })
            .then((data) => {
              const result = { result: { type: 'data' as const, data } };
              observer.next(result);
              observer.complete();
            })
            .catch((error) => {
              observer.error(error);
            });
        }
      });
    };
  };
}
