# Architecture Overview

## System Architecture

```mermaid
graph TB
    subgraph Client["CLIENT (Browser)"]
        NextJS["Next.js 15 App (React 19)<br/>━━━━━━━━━━━━━━━━━━━━━━<br/>• App Router (SSR + Client Components)<br/>• TailwindCSS for styling<br/>• tRPC React Query hooks<br/>• AWS Amplify client (auth + config)"]
    end
    
    subgraph Backend["AWS AMPLIFY GEN2 BACKEND"]
        Cognito["AWS Cognito (Authentication)<br/>━━━━━━━━━━━━━━━━━━━━━━<br/>• User Pool for authentication<br/>• Email + Password login<br/>• JWT token generation"]
        
        AppSync["AWS AppSync Events (WebSocket Layer)<br/>━━━━━━━━━━━━━━━━━━━━━━<br/>• Event-driven pub/sub<br/>• WebSocket connection management<br/>• Real-time event distribution<br/>• Custom tRPC event channel"]
        
        Lambda["AWS Lambda (tRPC Handler Function)<br/>━━━━━━━━━━━━━━━━━━━━━━<br/>• Processes tRPC requests<br/>• Routes to appropriate procedures<br/>• Validates authentication<br/>• Executes business logic"]
        
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

### 4. WebSocket Flow (Prepared for Real-time)

```mermaid
sequenceDiagram
    participant Client
    participant WS as AppSync Events WebSocket
    participant Lambda
    participant Handler as tRPC Subscription Handler
    participant UI as React Component
    
    Client->>WS: Connect<br/>wss://[endpoint]/realtime<br/>+ Authorization header
    Client->>WS: Subscribe to tRPC channel
    Note over WS: Maintained Connection
    Note over Lambda: On server event
    Lambda->>WS: Publish event
    WS->>Client: Broadcast to all subscribed clients
    Client->>Handler: Process event
    Handler->>UI: Update component
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

## Data Model (Drizzle Schema)

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

## Security Layers

### 1. Network Security
- HTTPS/WSS encryption for all traffic
- VPC for database (optional)
- Security groups for AWS resources

### 2. Authentication
- AWS Cognito JWT tokens
- Token validation on every request
- Automatic token refresh

### 3. Authorization
- tRPC context includes authenticated user
- Protected procedures check user identity
- Row-level security in procedures (author checks)

### 4. Input Validation
- Zod schemas validate all inputs
- SQL injection prevention via Drizzle parameterization
- XSS protection in React (automatic escaping)

### 5. Rate Limiting (To Implement)
- API Gateway throttling
- Lambda concurrency limits
- Application-level rate limiting

## Scalability Considerations

### Horizontal Scaling
- **Lambda**: Automatically scales to handle requests
- **Next.js**: Deploy to multiple regions with Vercel
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
- Error rates
- Database query performance

### User Analytics (Optional)
- Page views
- User engagement
- Conversion tracking

## Cost Structure

### Variable Costs (Per Request)
- Lambda invocations: $0.0000002 per request
- Lambda duration: $0.0000166667 per GB-second
- Database queries: Included in database cost

### Fixed Costs (Monthly)
- Database: $15-100 depending on size
- Amplify hosting: $0 (frontend on Vercel)
- Cognito: Free tier covers most use cases

### Optimization Tips
- Use database indexes for fast queries
- Minimize Lambda cold starts
- Cache frequently accessed data
- Use Amplify free tier resources

## Deployment Environments

### Development
- Local Next.js server
- Amplify sandbox
- Local or dev database

### Staging
- Vercel preview deployment
- Amplify staging branch
- Staging database

### Production
- Vercel production
- Amplify production branch
- Production database with backups

## Technology Choices - Rationale

### Next.js 15
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

This architecture provides a solid foundation for a production-ready blog platform with room to grow.
