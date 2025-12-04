# Message Chunking Implementation

## Overview

This implementation adds transparent message chunking support to handle AppSync Event API's 240KB message size limit. Both client and server can send and receive messages larger than 240KB without any changes to the application code.

## Architecture

### Key Components

1. **PostgreSQL Table** (`message_chunks`)
   - Stores message chunks temporarily in the existing PostgreSQL database
   - Composite primary key: `messageId` (varchar) + `chunkIndex` (integer)
   - Includes `totalChunks`, `chunkData` (text), and `createdAt` (timestamp)
   - Cleanup via periodic background job (removes chunks older than 1 hour)

2. **Client-Side Chunking** (`src/lib/trpc/appsync-ws-link.ts`)
   - Detects large outgoing messages
   - Splits messages into 200KB chunks
   - Sends chunks sequentially
   - Reassembles incoming chunks using in-memory `ChunkStore`

3. **Server-Side Chunking** (`amplify/events/handler.ts`)
   - Receives and stores chunks in PostgreSQL `message_chunks` table
   - Reassembles complete messages using Drizzle ORM
   - Processes tRPC requests
   - Chunks large responses if needed
   - Cleans up chunks from database after processing

4. **Shared Utilities**
   - `src/lib/trpc/chunking-utils.ts` - Client-side utilities
   - `amplify/events/chunking-utils.ts` - Server-side utilities

## How It Works

### Request Flow (Client → Server)

1. Client prepares tRPC request
2. `AppSyncWebSocketLink.request()` checks message size
3. If > 230KB:
   - Message is split into 200KB chunks
   - Each chunk includes: `messageId`, `chunkIndex`, `totalChunks`, `chunkData`
   - Chunks are sent sequentially via WebSocket
4. Server receives chunks:
   - Stores each chunk in PostgreSQL `message_chunks` table
   - Checks if all chunks are received
   - When complete, reassembles message
   - Processes tRPC request
   - Cleans up chunks from PostgreSQL

### Response Flow (Server → Client)

1. Server processes tRPC request
2. Before sending response, checks size
3. If > 230KB:
   - Response is split into chunks
   - All chunks included in single response object
4. Client receives response:
   - Detects `isChunkedResponse` flag
   - Processes all chunks from `chunks` array
   - Reassembles using `ChunkStore`
   - Resolves tRPC promise with complete data

## Configuration

### Environment Variables

- `DATABASE_URL` - PostgreSQL connection string (used for both app data and chunk storage)

### Constants

```typescript
// Both client and server
MAX_MESSAGE_SIZE = 230 * 1024  // 230KB (safety buffer)
CHUNK_SIZE = 200 * 1024        // 200KB per chunk
```

### Automatic Cleanup

Chunks are automatically cleaned up after processing. A periodic cleanup job can be run to remove chunks older than 1 hour to prevent orphaned data from accumulating.

## Message Format

### Chunked Message

```typescript
{
  isChunked: true,
  messageId: "msg-1234567890-abc123",
  chunkIndex: 0,
  totalChunks: 3,
  chunkData: "base64EncodedData..."
}
```

### Chunked Response

```typescript
{
  isChunkedResponse: true,
  messageId: "msg-1234567890-xyz789",
  totalChunks: 3,
  requestId: "req-abc123",
  chunks: [
    { isChunked: true, messageId: "...", chunkIndex: 0, ... },
    { isChunked: true, messageId: "...", chunkIndex: 1, ... },
    { isChunked: true, messageId: "...", chunkIndex: 2, ... }
  ]
}
```

## Deployment

1. Install Lambda dependencies:
   ```bash
   cd amplify/events
   npm install
   ```

2. Apply database migrations:
   ```bash
   npm run db:migrate
   ```

3. Deploy infrastructure:
   ```bash
   npm run amplify:sandbox
   # or
   npm run amplify:deploy
   ```

The deployment will:
- Use existing PostgreSQL database for chunk storage
- Ensure Lambda has access to `DATABASE_URL` environment variable
- Create `message_chunks` table via Drizzle migrations

## Monitoring

### CloudWatch Logs

Search for:
- `"Message needs chunking"` - Large outgoing messages
- `"Received chunk"` - Incoming chunk tracking
- `"All chunks received"` - Message reassembly
- `"Response needs chunking"` - Large responses

### PostgreSQL Metrics

Monitor:
- Query performance on `message_chunks` table
- Row count in `message_chunks` table (should stay near 0 with cleanup)
- Connection pool usage
- Storage space (chunks should be cleaned up regularly)

## Error Handling

### Client-Side

- **Timeout**: If chunks don't arrive within 1 minute, `ChunkStore` cleans up
- **Missing Chunks**: Error thrown when reassembling incomplete message
- **Network Issues**: Standard WebSocket reconnection logic applies

### Server-Side

- **Missing Chunks**: Request remains incomplete until all chunks arrive or cleanup job runs
- **PostgreSQL Errors**: Logged and chunks cleaned up
- **Processing Errors**: Chunks deleted to prevent orphaned data

## Performance Considerations

### Chunking Overhead

- **Small Messages**: Zero overhead, sent as single message
- **Large Messages**: 
  - Base64 encoding adds ~33% size overhead
  - Each chunk requires separate WebSocket send
  - PostgreSQL operations add minimal latency (~5-20ms per chunk)

### Optimization Tips

1. **Avoid Large Responses**: Use pagination for list queries
2. **Compress Data**: Use efficient data structures
3. **Batch Operations**: Group multiple small operations instead of one large one

## Testing

### Test Large Messages

```typescript
// Generate large test data
const largeData = Array.from({ length: 10000 }, (_, i) => ({
  id: i,
  title: `Item ${i}`,
  content: 'x'.repeat(100), // 100 chars per item
}));

// Use in tRPC query/mutation
const result = await trpc.posts.list.query({ limit: 10000 });
```

### Verify Chunking

1. Check browser console for chunking logs
2. Check CloudWatch logs for chunk processing
3. Query `message_chunks` table in PostgreSQL to verify chunk storage and cleanup

## Security

### Access Control

- Lambda role has read/write access to chunking table only
- No public access to DynamoDB table
- Chunks inherit authentication from parent request

### Data Protection

- Chunks stored in DynamoDB with encryption at rest
- TTL ensures automatic cleanup
- No sensitive data exposed in chunk metadata

## Limitations

1. **Maximum Message Size**: No hard limit, but very large messages (>10MB) may hit Lambda timeout
2. **Chunk Order**: Must be received in order for client-side reassembly
3. **Network Reliability**: All chunks must arrive successfully
4. **PostgreSQL Text Field**: No practical size limit for text fields in PostgreSQL

## Future Enhancements

1. **Compression**: Add gzip compression before chunking
2. **Parallel Chunk Sending**: Send multiple chunks simultaneously
3. **Retry Logic**: Automatic retry for failed chunks
4. **Progress Tracking**: Emit progress events during chunking
5. **Adaptive Chunk Size**: Adjust chunk size based on network conditions
