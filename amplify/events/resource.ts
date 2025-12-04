import { defineFunction } from '@aws-amplify/backend';

/**
 * AppSync Events API Lambda handler with integrated tRPC server
 * This Lambda processes all WebSocket events and tRPC requests
 */
export const eventsHandler = defineFunction({
  name: 'blog-trpc-events-handler',
  entry: './handler.ts',
  timeoutSeconds: 30,
  memoryMB: 512,
  environment: {
    DATABASE_URL: process.env.DATABASE_URL || '',
    NODE_ENV: process.env.NODE_ENV || 'production',
  },
});
