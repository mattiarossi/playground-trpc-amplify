# Architecture Overview

## System Architecture

```mermaid
graph TB
    subgraph Client["CLIENT (Browser)"]
        NextJS["Next.js 16 App (React 19)<br/>━━━━━━━━━━━━━━━━━━━━━━<br/>• App Router (SSR + Client Components)<br/>• TailwindCSS for styling<br/>• tRPC React Query hooks (with polling)<br/>• AWS Amplify client (auth + config)<br/>• WebSocket connection for transport"]
    end
    
    subgraph Backend["AWS AMPLIFY GEN2 BACKEND"]
        Cognito["AWS Cognito (Authentication)<br/>━━━━━━━━━━━━━━━━━━━━━━<br/>• User Pool for authentication<br/>• Email + Password login<br/>• JWT token generation"]
        
        AppSync["AWS AppSync Events (WebSocket Layer)<br/>━━━━━━━━━━━━━━━━━━━━━━<br/>• Event-driven pub/sub<br/>• WebSocket connection management<br/>• Real-time event distribution<br/>• Custom tRPC event channel<br/>• 240KB message size limit"]
        
        Lambda["AWS Lambda (tRPC Handler Function)<br/>━━━━━━━━━━━━━━━━━━━━━━<br/>• Processes tRPC requests<br/>• Routes to appropriate procedures<br/>• Validates authentication<br/>• Executes business logic<br/>• Handles message chunking"]
        
        Cognito --> AppSync
        AppSync --> Lambda
    end
    
    subgraph DataLayer["DATA LAYER"]
        Drizzle["Drizzle ORM<br/>━━━━━━━━━━━━━━━━━━━━━━<br/>• Type-safe schema definitions<br/>• Migration management<br/>• Query builder with relations<br/>• Type inference for tRPC"]
        
        Postgres["PostgreSQL Database<br/>━━━━━━━━━━━━━━━━━━━━━━<br/>• Users table<br/>• Posts table<br/>• Comments table<br/>• Full-text search indexes"]
        
        Drizzle --> Postgres
    end
    
    NextJS -->|HTTP / WebSocket| Cognito
    Lambda -->|PostgreSQL Protocol| Drizzle
    
    style Client fill:#e1f5ff
    style Backend fill:#fff4e1
    style DataLayer fill:#f0f0f0
```

## Request Flow

### 1. Authentication Flow

```mermaid
sequenceDiagram
    participant User as User Browser
    participant Next as Next.js App
    participant Cognito as AWS Cognito
    
    User->>Next: 1. Sign Up/Sign In
    Next->>Cognito: 2. Call Amplify Auth
    Cognito->>Next: 3. Return JWT tokens
    Next->>Next: 4. Store tokens
    Note over Next: 5. Include in API requests
    Next->>User: Authenticated Session
```

### 2. Query Flow (Read Operations)

```mermaid
sequenceDiagram
    participant User as User Action
    participant Hook as tRPC React Query Hook
    participant API as Next.js API Route
    participant Router as tRPC Router
    participant ORM as Drizzle ORM
    participant DB as PostgreSQL
    participant UI as React Component
    
    User->>Hook: view posts
    Note over Hook: trpc.post.list.useQuery()
    Hook->>API: HTTP Request to /api/trpc<br/>+ Authorization: Bearer token
    Note over API: 1. Extract JWT from header<br/>2. Verify with Cognito<br/>3. Create tRPC context
    API->>Router: post.list
    Note over Router: 1. Validate input with Zod<br/>2. Check permissions
    Router->>ORM: Query
    Note over ORM: db.query.posts.findMany()
    ORM->>DB: Execute SQL query
    DB->>ORM: Results
    ORM->>Router: Serialize with SuperJSON
    Router->>API: Type-safe data
    API->>Hook: Response
    Hook->>UI: Update
```

### 3. Mutation Flow (Write Operations)

```mermaid
sequenceDiagram
    participant User as User Action
    participant Hook as tRPC Mutation Hook
    participant API as Next.js API Route
    participant Router as tRPC Router
    participant ORM as Drizzle ORM
    participant DB as PostgreSQL
    participant UI as UI
    
    User->>Hook: create post
    Note over Hook: trpc.post.create.useMutation()
    Hook->>API: HTTP POST to /api/trpc<br/>+ Authorization: Bearer token<br/>+ Request body with data
    Note over API: Extract & verify JWT
    API->>Router: post.create
    Note over Router: 1. Validate input (Zod schema)<br/>2. Check user is authenticated<br/>3. Verify user profile exists
    Router->>ORM: Mutation
    Note over ORM: db.insert(posts).values(...)
    ORM->>DB: INSERT INTO posts... RETURNING *
    DB->>ORM: Created Post
    ORM->>Router: Return with full type info
    Router->>API: Response
    API->>Hook: Update React Query cache
    Hook->>UI: Updates Automatically
```

### 4. WebSocket Flow (tRPC over AppSync Events)

```mermaid
sequenceDiagram
    participant Client
    participant WS as AppSync Events WebSocket
    participant Lambda as tRPC Lambda Handler
    participant DB as PostgreSQL
    participant UI as React Component
    
    Client->>WS: Connect<br/>wss://[endpoint]/event<br/>+ Authorization header
    Client->>WS: Subscribe to tRPC channel
    Note over WS: Maintained Connection
    
    alt Small Message (<230KB)
        Client->>WS: Publish tRPC request
        WS->>Lambda: Forward request
        Lambda->>DB: Query/Mutation
        DB->>Lambda: Result
        Lambda->>WS: Response
        WS->>Client: Broadcast response
        Client->>UI: Update component
    else Large Message (>230KB)
        Note over Client: Split into 200KB chunks
        Client->>WS: Publish chunk 1
        Client->>WS: Publish chunk 2
        Client->>WS: Publish chunk N
        WS->>Lambda: Forward chunks
        Lambda->>DB: Store chunks in PostgreSQL message_chunks table
        Note over Lambda: Wait for all chunks
        Lambda->>DB: Retrieve all chunks via Drizzle ORM
        Lambda->>Lambda: Reassemble message
        Lambda->>DB: Process tRPC request
        DB->>Lambda: Result
        alt Large Response (>230KB)
            Note over Lambda: Split response into chunks
            Lambda->>WS: Response with all chunks
            WS->>Client: Broadcast chunked response
            Note over Client: Reassemble from chunks
        else Small Response
            Lambda->>WS: Response
            WS->>Client: Broadcast response
        end
        Lambda->>DB: Cleanup chunks from message_chunks table
        Client->>UI: Update component
    end
```

## Type Safety Flow

```mermaid
flowchart TD
    A[Database Schema<br/>schema.ts] -->|Drizzle ORM| B[TypeScript Types Generated]
    B -->|type Post = typeof posts.$inferSelect| C[tRPC Router Definitions]
    C -->|Input: z.object<br/>Output: inferred from Drizzle| D[tRPC Client Types]
    D -->|Automatically inferred| E[React Components]
    E -->|Full autocomplete & type checking<br/>No manual type definitions needed| F[Type-Safe Application]
```

## Data Model

### Application Schema (Drizzle ORM)

```mermaid
erDiagram
    USERS ||--o{ POSTS : "authors (One-to-Many)"
    USERS ||--o{ COMMENTS : "authors (One-to-Many)"
    POSTS ||--o{ COMMENTS : "has (One-to-Many)"
    COMMENTS ||--o{ COMMENTS : "replies (Self-referencing)"
    
    USERS {
        uuid id PK
        string email
        string name
        string cognitoSub
        string avatarUrl
        text bio
        timestamp createdAt
        timestamp updatedAt
    }
    
    POSTS {
        uuid id PK
        string title
        string slug UK "UNIQUE"
        text content
        string excerpt
        boolean published
        uuid authorId FK
        int viewCount
        timestamp createdAt
        timestamp updatedAt
    }
    
    COMMENTS {
        uuid id PK
        text content
        uuid postId FK
        uuid authorId FK
        uuid parentId FK "nullable"
        timestamp createdAt
        timestamp updatedAt
    }
```

### Message Chunking Schema (PostgreSQL)

```mermaid
erDiagram
    MESSAGE_CHUNKS {
        varchar messageId "Composite Key (Part 1)"
        int chunkIndex "Composite Key (Part 2)"
        int totalChunks
        text chunkData "Base64 encoded"
        timestamp createdAt
    }
```

## Security Layers

### 1. Network Security
- HTTPS/WSS encryption for all traffic
- VPC for database (optional)
- Security groups for AWS resources

### 2. Authentication
- AWS Cognito JWT tokens
- Token validation on every request
- Automatic token refresh
## Scalability Considerations

### Horizontal Scaling
- **Lambda**: Automatically scales to handle requests
- **Next.js**: Can be deployed with AWS Amplify Hosting or other providers
- **Database**: Add read replicas for queries; chunk storage uses same PostgreSQL instance

### Vertical Scaling
- **Database**: Upgrade instance size as needed
- **Lambda**: Increase memory allocation (increases CPU)

### Caching Strategy
- **React Query**: Client-side caching (5s stale time)
- **CDN**: Static assets cached at edge
- **Database**: Add Redis for frequently accessed data
- **Message Chunks**: Client-side ChunkStore with 1-minute timeout

### Connection Pooling
- **Drizzle**: Reuse connections in Lambda
- **PgBouncer**: Pool connections to PostgreSQL

### Message Size Optimization
- **Chunking**: Transparent 200KB chunking for messages >230KB
- **DynamoDB Storage**: Temporary chunk storage with TTL cleanup
- **Base64 Encoding**: Safe transmission with ~33% size overhead
- **Best Practices**: Use pagination and field selection to minimize payload sizes
- **Lambda**: Automatically scales to handle requests
- **Next.js**: Can be deployed with AWS Amplify Hosting or other providers
- **Database**: Add read replicas for queries

### Vertical Scaling
- **Database**: Upgrade instance size as needed
- **Lambda**: Increase memory allocation (increases CPU)

### Caching Strategy
- **React Query**: Client-side caching (5s stale time)
- **CDN**: Static assets cached at edge
- **Database**: Add Redis for frequently accessed data

### Connection Pooling
- **Drizzle**: Reuse connections in Lambda
- **PgBouncer**: Pool connections to PostgreSQL

## Monitoring & Observability

### AWS CloudWatch
- Lambda execution logs
- Error tracking and alarms
- Performance metrics

### Application Metrics
- Request latency
## Cost Structure

### Variable Costs (Per Request)
- Lambda invocations: $0.0000002 per request
- Lambda duration: $0.0000166667 per GB-second
- Database queries: Included in database cost (includes chunk storage)
- AppSync Events: $2.40 per million messages + $0.08 per million connection minutes

### Fixed Costs (Monthly)
- Database: $15-100 depending on size (includes chunk storage)
- AWS Amplify Hosting: Free tier available, then ~$0.01/build minute + $0.15/GB stored
- Cognito: Free tier covers most use cases (50,000 MAUs)

### Optimization Tips
- Use database indexes for fast queries
- Minimize Lambda cold starts
- Cache frequently accessed data
- Use Amplify free tier resources
- **Chunking optimization**: Minimize large payloads to reduce PostgreSQL write/read operations
- **Pagination**: Use pagination instead of large result sets to avoid chunking overhead
- **Cleanup job**: Periodic cleanup of old chunks (>1 hour) via scheduled task prevents storage bloat

## Deployment Environments

### Development
## Technology Choices - Rationale

### Next.js 16
- Industry standard for React SSR
- Excellent developer experience
- Built-in API routes
- Great performance

### tRPC
- End-to-end type safety
- No code generation needed
- Minimal boilerplate
- Excellent DX

### Drizzle ORM
- Type-safe schema definitions
- Zero runtime overhead
- Great migration system
- SQL-like query builder

### AWS Amplify Gen2
- Simplified cloud development
- Infrastructure as code
- Integrated auth & API
- Great for startups/MVPs

### PostgreSQL
- Robust and reliable
- Rich feature set
- Great ecosystem
- Scalable

### AppSync Events API
- WebSocket-based persistent communication layer
- Integrated with Cognito authentication
- Event-driven pub/sub architecture
- Built-in connection management
- **Client Strategy**: Uses React Query polling over WebSocket for efficient data fetching
- **Note**: 240KB message size limit handled via transparent PostgreSQL-based chunking

### PostgreSQL for Chunking
- Uses existing database infrastructure (no DynamoDB needed)
- No additional services or costs required
- Simple `message_chunks` table managed with Drizzle ORM
- Fast read/write operations with minimal latency (~5-20ms per chunk)
- Automatic cleanup after processing, with periodic background jobs for orphaned chunks

## Message Chunking System

### Architecture Decision
To handle AppSync Events API's 240KB message size limit, a transparent chunking system has been implemented:

#### Client-Side (`src/lib/trpc/appsync-ws-link.ts`)
- Detects messages >230KB before sending
- Splits into 200KB base64-encoded chunks
- Sends chunks sequentially via WebSocket
- Reassembles incoming chunked responses using in-memory `ChunkStore`
- 1-minute timeout for incomplete messages

#### Server-Side (`amplify/events/handler.ts`)
- Receives chunks and stores in PostgreSQL `message_chunks` table using Drizzle ORM
- Waits for all chunks to arrive before processing
- Reassembles complete message from stored chunks
- Processes tRPC request normally
- Chunks large responses if needed (>230KB)
- Cleans up chunks from PostgreSQL after processing to prevent orphaned data

#### Shared Utilities
- **Client**: `src/lib/trpc/chunking-utils.ts` (browser-compatible)
- **Server**: `amplify/events/chunking-utils.ts` (Node.js with Drizzle ORM)

#### Key Features
- ✅ **Transparent**: No application code changes needed
- ✅ **Bidirectional**: Works for requests and responses
- ✅ **Automatic Cleanup**: Periodic cleanup job removes old chunks
- ✅ **Error Handling**: Cleanup on errors and timeouts
- ✅ **Zero Overhead**: Small messages (<230KB) sent normally
- ✅ **Single Database**: Uses same PostgreSQL instance, no additional infrastructure

#### Performance Impact
- Small messages: Zero overhead
- Large messages: ~33% size increase (base64) + PostgreSQL insert/query latency (~5-20ms per chunk)
- Best practice: Use pagination to avoid large payloads

#### Monitoring
- CloudWatch logs track chunking events
- PostgreSQL query logs show chunk storage operations
- Client console logs show chunking activity

See `CHUNKING.md`, `CHUNKING_SUMMARY.md`, and `CHUNKING_QUICKSTART.md` for detailed documentation.

This architecture provides a solid foundation for a production-ready blog platform with room to grow.

### AWS Amplify Gen2
- Simplified cloud development
- Infrastructure as code
- Integrated auth & API
- Great for startups/MVPs

### PostgreSQL
- Robust and reliable
- Rich feature set
- Great ecosystem
- Scalable

This architecture provides a solid foundation for a production-ready blog platform with room to grow.
