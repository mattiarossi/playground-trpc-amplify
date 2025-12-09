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
  private isSubscribing = false; // Track if subscription is in progress
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
  private lastPublishErrorTime: number | null = null; // Track last publish_error for reconnection logic
  private publishErrorCount = 0; // Count consecutive publish_errors
  private sessionRequested = false; // Track if session has been requested
  private connectionResolve: ((ws: WebSocket) => void) | null = null; // Store resolve callback for connection

  constructor(private options: WebSocketLinkOptions) {
    // Session ID will be obtained from server after connection
    // This ensures secure server-side session management
    this.sessionId = '';
    this.channelName = '';
    // Add instance ID for debugging
    (this as any).__instanceId = Math.random().toString(36).substring(7);
  }

  /**
   * Check if the WebSocket connection is healthy and ready to use
   * A healthy connection must be:
   * - WebSocket is OPEN
   * - Connection is established (connection_ack received)
   * - Channel subscription is active (subscribe_success received)
   * - No recent publish_error messages
   */
  public isHealthy(): boolean {
    const isOpen = this.ws?.readyState === WebSocket.OPEN;
    // Consider established if subscribed OR currently subscribing to main channel
    const isEstablished = this.isConnected && (this.isSubscribed || this.isSubscribing);
    
    // Consider unhealthy if we've had multiple publish_errors recently
    const now = Date.now();
    const hasRecentPublishErrors = this.lastPublishErrorTime && 
      (now - this.lastPublishErrorTime < 5000) && // Within last 5 seconds
      this.publishErrorCount >= 2; // At least 2 consecutive errors
    
    const healthy = isOpen && isEstablished && !hasRecentPublishErrors;
    
    if (!healthy) {
      console.warn('[AppSync] Health check failed:', {
        wsReadyState: this.ws?.readyState,
        isConnected: this.isConnected,
        isSubscribed: this.isSubscribed,
        hasRecentPublishErrors
      });
    }
    
    return healthy;
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

  /**
   * Wait for a temporary subscription to be confirmed
   */
  private waitForSubscriptionConfirmation(tempSubKey: string, timeoutMs = 5000): Promise<void> {
    return new Promise((resolve, reject) => {
      const startTime = Date.now();
      
      const checkConfirmation = () => {
        if ((window as any)[tempSubKey]?.confirmed) {
          delete (window as any)[tempSubKey];
          resolve();
        } else if (Date.now() - startTime > timeoutMs) {
          delete (window as any)[tempSubKey];
          reject(new Error('Subscription confirmation timeout'));
        } else {
          // Use requestAnimationFrame for efficient polling
          requestAnimationFrame(checkConfirmation);
        }
      };
      
      requestAnimationFrame(checkConfirmation);
    });
  }

  /**
   * Wait for session ID to be received from server
   */
  private waitForSessionId(timeoutMs = 10000): Promise<void> {
    return new Promise((resolve, reject) => {
      const startTime = Date.now();
      
      const checkSessionId = () => {
        if (this.sessionId) {
          resolve();
        } else if (Date.now() - startTime > timeoutMs) {
          reject(new Error('Session request timeout'));
        } else {
          requestAnimationFrame(checkSessionId);
        }
      };
      
      requestAnimationFrame(checkSessionId);
    });
  }

  private connect(): Promise<WebSocket> {
    if (this.ws?.readyState === WebSocket.OPEN && this.isConnected) {
      return Promise.resolve(this.ws);
    }

    if (this.isConnecting) {
      // Return a promise that resolves when connection is ready
      return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('Connection timeout'));
        }, 30000); // 30 second timeout
        
        const checkConnection = () => {
          if (this.ws?.readyState === WebSocket.OPEN && this.isConnected) {
            clearTimeout(timeout);
            resolve(this.ws);
          } else {
            requestAnimationFrame(checkConnection);
          }
        };
        
        requestAnimationFrame(checkConnection);
      });
    }

    this.isConnecting = true;
    this.isConnected = false;
    this.isSubscribed = false;
    this.sessionRequested = false; // Reset session request flag on reconnection
    // Reset publish error tracking on new connection attempt
    this.publishErrorCount = 0;
    this.lastPublishErrorTime = null;

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
              
              // Request a session from the server before subscribing
              this.requestSession(authHeader, resolve);
              return;
            }

            // Handle keep-alive messages
            if (response.type === 'ka') {
              this.resetKeepAliveTimeout();
              return;
            }

            // Handle subscribe_success
            if (response.type === 'subscribe_success') {
              // Check if this is for the temporary session subscription
              const tempSubKey = `__tempSub_${response.id}`;
              if ((window as any)[tempSubKey]) {
                (window as any)[tempSubKey].confirmed = true;
                return;
              }
              
              // Verify the subscription ID matches what we sent for main channel
              if (response.id === this.subscriptionId) {
                this.isSubscribed = true;
                this.isSubscribing = false; // Subscription completed successfully
                
                // Reset publish error tracking on successful subscription
                this.publishErrorCount = 0;
                this.lastPublishErrorTime = null;
                
                // Resolve connection promise if we have a stored resolver
                if (this.connectionResolve && this.ws) {
                  this.connectionResolve(this.ws);
                  this.connectionResolve = null;
                }
                
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
              this.isSubscribing = false; // Subscription failed
              this.subscriptionId = null;
              console.error('[AppSync] Subscription error:', response);
              
              // If this is during session setup, we need to reconnect
              if (!this.sessionId) {
                console.error('[AppSync] Session subscription failed, reconnecting...');
                this.ws?.close();
              }
              return;
            }

            // Handle data events (tRPC responses and subscription events)
            if (response.type === 'data' && response.event) {
              // Parse event if it's a string, otherwise use as-is
              let eventData = typeof response.event === 'string' 
                ? JSON.parse(response.event) 
                : response.event;
              
              // AppSync Events might wrap the response - check for common patterns
              // If event is just {}, it might be an empty response from publish
              if (eventData && typeof eventData === 'object' && Object.keys(eventData).length === 0) {
                return;
              }
              
              // Check if this is a session creation response
              if (eventData && eventData.type === 'session_created' && eventData.sessionId) {
                this.sessionId = eventData.sessionId;
                this.channelName = `trpc/${this.sessionId}`;
                
                // Clean up temporary session subscription mapping
                if (response.id) {
                  const tempChannel = this.subscriptionIdToChannel.get(response.id);
                  if (tempChannel && tempChannel.startsWith('trpc/session-request-')) {
                    this.subscriptionIdToChannel.delete(response.id);
                    // Note: We don't unsubscribe from AppSync as it will auto-cleanup
                  }
                }
                
                // Now subscribe to the tRPC channel with our server-assigned session
                this.subscribeToChannel(this.currentAuthHeader);
                return;
              }
              
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

            // Handle publish_success (with direct Lambda response)
            if (response.type === 'publish_success') {
              // Reset error tracking on successful publish
              this.publishErrorCount = 0;
              this.lastPublishErrorTime = null;
              
              // With direct: true, Lambda response comes in publish_success
              // Check successful array for session creation response
              const sessionRequestId = (window as any).__sessionRequestId;
              if (response.successful && Array.isArray(response.successful) && response.successful.length > 0) {
                try {
                  const firstSuccess = response.successful[0];
                  
                  // Check if this response is for our session request
                  const isSessionRequest = response.id === (window as any).__lastSessionPublishId;
                  
                  if (isSessionRequest) {
                    // This is the session request response
                    // With direct:true, check if response has the Lambda result
                    // Try multiple possible locations for the Lambda response
                    let sessionResponse = null;
                    
                    if ((response as any).result) {
                      sessionResponse = (response as any).result;
                    } else if ((response as any).data) {
                      sessionResponse = (response as any).data;
                    } else if (firstSuccess && typeof firstSuccess === 'object' && 'data' in firstSuccess) {
                      sessionResponse = (firstSuccess as any).data;
                    }
                    
                    if (sessionResponse && sessionResponse.type === 'session_created' && sessionResponse.sessionId) {
                      this.sessionId = sessionResponse.sessionId;
                      this.channelName = `trpc/${this.sessionId}`;
                      
                      // Clean up
                      delete (window as any).__sessionRequestId;
                      delete (window as any).__lastSessionPublishId;
                      
                      // Now subscribe to the tRPC channel with our server-assigned session
                      this.subscribeToChannel(this.currentAuthHeader);
                      return;
                    }
                  }
                } catch (e) {
                  console.error('[AppSync] Error parsing publish_success response:', e);
                }
              }
              
              // Also check event field for backwards compatibility
              if (response.event) {
                try {
                  const eventData = JSON.parse(response.event);
                  
                  if (eventData.type === 'session_created' && eventData.sessionId) {
                    this.sessionId = eventData.sessionId;
                    this.channelName = `trpc/${this.sessionId}`;
                    
                    // Now subscribe to the tRPC channel with our server-assigned session
                    this.subscribeToChannel(this.currentAuthHeader);
                    return;
                  }
                } catch (e) {
                  // Not JSON or not a session response, continue
                }
              }
              
              return;
            }

            // Handle publish_error
            if (response.type === 'publish_error') {
              console.warn('[AppSync] Received publish_error, connection may be stale:', response);
              
              // Track publish errors
              this.publishErrorCount++;
              this.lastPublishErrorTime = Date.now();
              
              // If we've had multiple publish errors, the connection is likely stale
              // (e.g., auth token expired). Force a reconnection.
              if (this.publishErrorCount >= 2) {
                console.warn('[AppSync] Multiple publish_errors detected, forcing reconnection');
                // Close and reconnect to get fresh auth
                this.ws?.close();
              }
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

        this.ws.onclose = (event) => {
          console.log('[AppSync] WebSocket closed:', {
            code: event.code,
            reason: event.reason,
            wasClean: event.wasClean,
            sessionId: this.sessionId,
            wasConnected: this.isConnected,
            wasSubscribed: this.isSubscribed
          });
          
          this.isConnecting = false;
          this.isConnected = false;
          this.isSubscribed = false;
          this.isSubscribing = false; // Reset subscribing flag
          this.subscriptionId = null; // Reset subscription ID on disconnect
          this.ws = null;
          
          if (this.keepAliveTimeout) {
            clearTimeout(this.keepAliveTimeout);
          }
          
          // Attempt to reconnect after 3 seconds
          this.reconnectTimeout = setTimeout(() => {
            console.log('[AppSync] Attempting to reconnect...');
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

  private async requestSession(authHeader: Record<string, string>, resolve: (ws: WebSocket) => void) {
    // Request a session ID from the server
    // The server will generate a UUID and link it to our Cognito user ID
    if (this.sessionRequested) {
      return; // Already requested
    }
    
    this.sessionRequested = true;
    this.connectionResolve = resolve; // Store resolve to call after subscription
    
    // Create a temporary channel for the session request/response
    // This ensures we receive the direct response from the Lambda
    const tempSessionChannel = `trpc/session-request-${Date.now()}`;
    const requestId = `req-${Date.now()}-${Math.random().toString(36).substring(7)}`;
    
    // First, subscribe to the temporary channel to receive the response
    const tempSubscriptionId = `sub-session-${Date.now()}`;
    const subscribeMessage = {
      type: 'subscribe',
      id: tempSubscriptionId,
      channel: tempSessionChannel,
      authorization: authHeader,
    };
    
    // Register this temporary subscription so data events can be routed correctly
    this.subscriptionIdToChannel.set(tempSubscriptionId, tempSessionChannel);
    
    // Track that we're waiting for this subscription to be confirmed
    const tempSubKey = `__tempSub_${tempSubscriptionId}`;
    (window as any)[tempSubKey] = { confirmed: false, id: tempSubscriptionId };
    
    this.ws?.send(JSON.stringify(subscribeMessage));
    
    // Wait for subscribe_success before publishing
    // This ensures the subscription is fully established and won't miss the response
    this.waitForSubscriptionConfirmation(tempSubKey)
      .then(() => {
        // Generate a stable client UUID (store in sessionStorage for persistence across page reloads)
        let clientUuid = sessionStorage.getItem('trpc_client_uuid');
        if (!clientUuid) {
          clientUuid = crypto.randomUUID();
          sessionStorage.setItem('trpc_client_uuid', clientUuid);
        }
        
        const publishMessage = {
          type: 'publish',
          id: requestId,
          channel: tempSessionChannel,
          events: [JSON.stringify({ 
            type: 'request_client_session',
            clientUuid, // Send client UUID to help generate deterministic session ID
          })],
          authorization: authHeader,
        };
        
        // Store both request ID and publish ID so we can match the publish_success response
        (window as any).__sessionRequestId = requestId;
        (window as any).__lastSessionPublishId = requestId;
        
        this.ws?.send(JSON.stringify(publishMessage));
        
        // Wait for session ID with timeout
        return this.waitForSessionId(10000);
      })
      .catch((error) => {
        console.error('[AppSync] Session setup failed:', error.message);
        this.ws?.close(); // Force reconnect
      });
    
    // Note: The response will be handled in the data event handler
    // Once we receive the session_created response, we'll subscribe to the channel
  }

  private async subscribeToChannel(authHeader: Record<string, string>) {
    // Generate unique subscription ID per connection
    // AppSync requires this ID to be unique per client connection
    this.subscriptionCounter++;
    this.subscriptionId = `sub-${Date.now()}-${this.subscriptionCounter}`;
    this.isSubscribing = true; // Mark that subscription is in progress
    
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
    
    // Create a chunk fetch request with timeout
    const timeout = setTimeout(() => {
      const chunkFetch = this.pendingChunkFetches.get(messageId);
      if (chunkFetch) {
        chunkFetch.reject(new Error('Timeout fetching chunks'));
        this.pendingChunkFetches.delete(messageId);
      }
    }, 30000); // 30 second timeout - necessary for network operations
    
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

      // Set timeout for request - necessary for network operations
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
    // If connection exists but is unhealthy, force reconnection
    if (this.ws && !this.isHealthy()) {
      console.warn('[AppSync] Connection unhealthy, forcing reconnection before subscribing to channel:', channel);
      this.ws.close();
    }
    
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
// Use globalThis to survive HMR reloads in development
const globalKey = Symbol.for('__APPSYNC_WS_LINK__');
const getGlobalWsLink = (): AppSyncWebSocketLink | null => {
  return (globalThis as any)[globalKey] || null;
};
const setGlobalWsLink = (link: AppSyncWebSocketLink | null) => {
  (globalThis as any)[globalKey] = link;
};

export function getSharedWebSocketLink(): AppSyncWebSocketLink | null {
  return getGlobalWsLink();
}

/**
 * Create tRPC link for AppSync Events WebSocket
 * Reuses existing instance if available to prevent multiple connections
 */
export function createAppSyncWebSocketLink<TRouter extends AnyRouter>(
  options: WebSocketLinkOptions
): TRPCLink<TRouter> {
  // Check if we already have an instance
  let wsLink = getGlobalWsLink();
  
  if (!wsLink) {
    // Create new instance only if one doesn't exist
    wsLink = new AppSyncWebSocketLink(options);
    setGlobalWsLink(wsLink);
  }

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
