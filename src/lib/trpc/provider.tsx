'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { createTRPCReact } from '@trpc/react-query';
import { useState, useEffect } from 'react';
import type { AppRouter } from '@/server/trpc/routers';
import { createAppSyncWebSocketLink } from './appsync-ws-link';
import superjson from 'superjson';
import { Amplify } from 'aws-amplify';
import { fetchAuthSession } from 'aws-amplify/auth';

/**
 * Create tRPC React hooks
 */
export const trpc = createTRPCReact<AppRouter>();

/**
 * tRPC Provider component
 */
export function TRPCProvider({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient({
    defaultOptions: {
      queries: {
        // Data is considered fresh for 30 seconds
        staleTime: 30 * 1000,
        // Cache persists for 5 minutes
        gcTime: 5 * 60 * 1000,
        // Disable automatic refetch on window focus by default
        // Individual queries can override this
        refetchOnWindowFocus: false,
        // Retry failed queries twice
        retry: 2,
        // Exponential backoff for retries
        retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
      },
      mutations: {
        // Retry failed mutations once
        retry: 1,
      },
    },
  }));

  const [trpcClient] = useState(() => {
    // Try to load from amplify_outputs.json first, fall back to env vars
    let httpEndpoint = process.env.NEXT_PUBLIC_APPSYNC_EVENTS_ENDPOINT || '';
    let wsEndpoint = '';
    let region = process.env.NEXT_PUBLIC_APPSYNC_EVENTS_REGION || 'us-east-1';

    // Try to load amplify_outputs.json dynamically
    try {
      // @ts-ignore
      const outputs = require('../../../amplify_outputs.json');
      
      // Configure Amplify with full outputs (includes auth)
      Amplify.configure(outputs);
      
      if (outputs?.custom?.events) {
        httpEndpoint = outputs.custom.events.url;
        // Convert HTTP endpoint to WebSocket realtime endpoint
        // Example: https://xxx.appsync-api.region.amazonaws.com/event -> wss://xxx.appsync-realtime-api.region.amazonaws.com/event/realtime
        wsEndpoint = httpEndpoint
          .replace('https://', 'wss://')
          .replace('.appsync-api.', '.appsync-realtime-api.')
          .replace('/event', '/event/realtime');
        region = outputs.custom.events.aws_region;
      }
    } catch (e) {
      console.log('amplify_outputs.json not found, using environment variables');
    }

    if (!httpEndpoint) {
      console.error('AppSync Events endpoint not configured. Please run "npx ampx sandbox" or set NEXT_PUBLIC_APPSYNC_EVENTS_ENDPOINT');
    }

    console.log('Configuring tRPC client with:', { httpEndpoint, wsEndpoint, region });

    return trpc.createClient({
      links: [
        createAppSyncWebSocketLink({
          url: wsEndpoint,
          httpEndpoint: httpEndpoint,
          // Function to get auth token dynamically
          getAuthToken: async () => {
            try {
              const session = await fetchAuthSession();
              return session.tokens?.idToken?.toString();
            } catch (error) {
              console.error('Failed to get auth token:', error);
              return undefined;
            }
          },
          // Use superjson transformer for serialization/deserialization
          transformer: superjson,
        }),
      ],
    });
  });

  return (
    <trpc.Provider client={trpcClient} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>
        {children}
        {process.env.NODE_ENV === 'development' && (
          <ReactQueryDevtools initialIsOpen={false} />
        )}
      </QueryClientProvider>
    </trpc.Provider>
  );
}
