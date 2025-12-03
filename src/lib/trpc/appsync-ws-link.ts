import type { TRPCLink } from '@trpc/client';
import { observable } from '@trpc/server/observable';
import { TRPCClientError } from '@trpc/client';
import type { AnyRouter } from '@trpc/server';

/**
 * Custom WebSocket tRPC link for AppSync Events API
 * This adapter bridges tRPC over AppSync Events WebSocket instead of HTTP
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
}

export class AppSyncWebSocketLink {
  private ws: WebSocket | null = null;
  private pendingRequests = new Map<string, PendingRequest>();
  private reconnectTimeout: NodeJS.Timeout | null = null;
  private isConnecting = false;
  private isConnected = false;
  private isSubscribed = false;
  private messageQueue: any[] = [];
  private channelName = 'trpc'; // AppSync Events channel name
  private keepAliveTimeout: NodeJS.Timeout | null = null;
  private connectionTimeoutMs = 300000; // 5 minutes default
  private subscriptionId: string | null = null; // Track subscription ID per connection
  private subscriptionCounter = 0; // Counter for unique subscription IDs

  constructor(private options: WebSocketLinkOptions) {}

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

            // Handle data events (tRPC responses)
            if (response.type === 'data' && response.event) {
              const eventData = JSON.parse(response.event);
              console.log('AppSync event data:', eventData);
              
              if (eventData.id && this.pendingRequests.has(eventData.id)) {
                const request = this.pendingRequests.get(eventData.id)!;
                
                if (eventData.error) {
                  request.reject(
                    new TRPCClientError(eventData.error.message, {
                      cause: eventData.error,
                    })
                  );
                } else if (eventData.result) {
                  // Response has result.data structure
                  // Deserialize using superjson if transformer is configured
                  const serializedData = eventData.result.data;
                  console.log('Serialized data:', serializedData);
                  const data = this.options.transformer 
                    ? this.options.transformer.deserialize(serializedData)
                    : serializedData;
                  console.log('Deserialized data:', data);
                  request.resolve(data);
                } else {
                  // This might be the original request being echoed back, not the response
                  // Don't resolve or reject yet - wait for actual response
                  console.log('Event data has no result, skipping:', eventData);
                  return;
                }
                
                this.pendingRequests.delete(eventData.id);
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
    
    const subscribeMessage = {
      type: 'subscribe',
      id: this.subscriptionId,
      channel: this.channelName,
      authorization: authHeader,
    };
    
    this.ws?.send(JSON.stringify(subscribeMessage));
  }

  public async request(operation: {
    type: 'query' | 'mutation' | 'subscription';
    path: string;
    input: any;
  }): Promise<any> {
    const ws = await this.connect();

    return new Promise(async (resolve, reject) => {
      const id = `req-${Math.random().toString(36).substring(7)}`;
      
      // Build authorization header
      const httpHost = new URL(this.options.httpEndpoint).host;
      const authHeader: Record<string, string> = {
        host: httpHost,
      };

      if (this.options.getAuthToken) {
        const token = await this.options.getAuthToken();
        if (token) {
          authHeader.Authorization = token;
        }
      }

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
      };
      
      // Wrap tRPC request in AppSync Events publish message
      const publishMessage = {
        type: 'publish',
        id: `pub-${Math.random().toString(36).substring(7)}`,
        channel: this.channelName,
        events: [JSON.stringify(eventPayload)],
        authorization: authHeader,
      };

      this.pendingRequests.set(id, { resolve, reject });

      if (ws.readyState === WebSocket.OPEN && this.isSubscribed) {
        ws.send(JSON.stringify(publishMessage));
      } else {
        // Queue message if not connected or not subscribed yet
        this.messageQueue.push(publishMessage);
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
}

/**
 * Create tRPC link for AppSync Events WebSocket
 */
export function createAppSyncWebSocketLink<TRouter extends AnyRouter>(
  options: WebSocketLinkOptions
): TRPCLink<TRouter> {
  const wsLink = new AppSyncWebSocketLink(options);

  return () => {
    return ({ op, next }) => {
      return observable((observer) => {
        const { type, path, input } = op;

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
      });
    };
  };
}
