# Blog Platform - tRPC + Amplify Gen2 + AppSync Events

A modern full-stack blog platform built with Next.js, tRPC, Drizzle ORM, PostgreSQL, and AWS Amplify Gen2. This application uses **AppSync Events API WebSocket as a transport layer for tRPC**, completely replacing traditional HTTP or GraphQL approaches.

## Architecture Overview

### Key Components

1. **Frontend (Next.js 16 + React 19)**
   - Client-side tRPC React Query hooks
   - Custom WebSocket adapter for AppSync Events
   - Tailwind CSS for styling
   - TypeScript for type safety

2. **Backend (AWS Lambda + Amplify Gen2)**
   - Single Lambda function handling all tRPC requests
   - AppSync Events API for WebSocket connectivity
   - Drizzle ORM for database operations
   - PostgreSQL database

3. **tRPC over WebSocket**
   - No GraphQL schemas required
   - No HTTP API Gateway needed
   - All queries, mutations, and subscriptions through WebSocket
   - Type-safe end-to-end communication

### Architecture Flow

```
┌─────────────────┐         WebSocket          ┌──────────────────────┐
│   Next.js App   │ ◄──────────────────────► │  AppSync Events API  │
│   (Frontend)    │                            │                      │
└─────────────────┘                            └──────────────────────┘
         │                                               │
         │ tRPC Client                                   │ Event Handler
         │                                               ▼
         │                                     ┌──────────────────────┐
         │                                     │   Lambda Function    │
         │                                     │   (tRPC Server)      │
         │                                     └──────────────────────┘
         │                                               │
         │                                               │ Drizzle ORM
         │                                               ▼
         │                                     ┌──────────────────────┐
         └─────── Type-safe Types ────────────►│   PostgreSQL DB      │
                                               └──────────────────────┘
```

## Features

- 📝 **Blog Posts**: Create, read, update, and delete blog posts with tag support
- 💬 **Comments**: Nested comments with replies
- 🏷️ **Tags**: Browse, create, and manage tags; organize posts with tags
- 👤 **User Profiles**: View and edit user profiles with bios and avatars
- 👥 **Admin Interface**: Cognito user management with group-based access control
- 🔍 **Search**: Search posts by title and content
- 📊 **View Counts**: Track post popularity
- 🎨 **Modern UI**: Responsive design with Tailwind CSS
- ⚡ **WebSocket Communication**: Persistent WebSocket connections via AppSync Events for efficient client-server communication
- 🔒 **Type Safety**: Full TypeScript coverage from database to UI
- 🔐 **Authentication**: AWS Cognito integration with role-based permissions

## Database Schema

### Tables

- **users**: User profiles and authentication
- **posts**: Blog post content and metadata
- **comments**: Comments and nested replies
- **tags**: Post categorization
- **posts_tags**: Many-to-many relationship between posts and tags

### Relationships

- Users → Posts (one-to-many)
- Users → Comments (one-to-many)
- Posts → Comments (one-to-many)
- Posts ↔ Tags (many-to-many through posts_tags)
- Comments → Comments (self-referential for replies)

## Prerequisites

- Node.js 18+ and npm/yarn/pnpm
- PostgreSQL database (local or remote)
- AWS Account with Amplify CLI configured
- AWS credentials configured locally

## Getting Started

### 1. Install Dependencies

```bash
npm install
```

### 2. Set Up Environment Variables

Copy the example environment file and configure it:

```bash
cp .env.local.example .env.local
```

Edit `.env.local` with your configuration:

```env
# Required: Database connection for local development
DATABASE_URL=postgresql://username:password@localhost:5432/blog_db

# Optional: Amplify backend configuration (see .env.local.example for more options)
# AMPLIFY_VPC_CONFIG='{"SecurityGroupIds":["sg-xxx"],"SubnetIds":["subnet-yyy"]}'
# AMPLIFY_DATABASE_URL=postgresql://user:pass@rds-host:5432/prod_db
```

See `.env.local.example` for a complete list of available configuration options.

### 3. Set Up Database

Create a PostgreSQL database locally or use a hosted service. Then run migrations:

```bash
# Generate migration files from schema
npm run db:generate

# Run migrations
npm run db:migrate

# Or push schema directly (for development)
npm run db:push
```

### 4. Seed Database (Optional)

Create a seed file to populate initial data:

```bash
# Create initial user for testing
# You can use Drizzle Studio to manually add data
npm run db:studio
```

### 5. Deploy Amplify Backend

#### Configuration Options

The backend supports flexible configuration for VPC and database connection through multiple sources (in order of priority):

**VPC Configuration:**
1. `process.env.secrets` - Amplify CI automatically loads from SSM parameters at `/amplify/{app-id}/{branch}/`
2. `process.env.AMPLIFY_VPC_CONFIG` - Custom environment variable (JSON string)
3. Empty arrays (default - no VPC)

**Database URL:**
1. `process.env.secrets` - Amplify CI automatically loads from SSM parameters
2. `process.env.AMPLIFY_DATABASE_URL` - Custom environment variable
3. Empty string (default)

Example VPC configuration format:
```json
{
  "SecurityGroupIds": ["sg-01be46a33248bed51"],
  "SubnetIds": ["subnet-07fd5a0e65be82d04"]
}
```

#### Setting Up SSM Parameters (Recommended for CI/CD)

Store secrets in AWS Systems Manager Parameter Store for automatic loading by Amplify CI:

```bash
# VPC Configuration
aws ssm put-parameter \
  --name "/amplify/{app-id}/{branch}/vpcConfig" \
  --type "String" \
  --value '{"SecurityGroupIds":["sg-xxx"],"SubnetIds":["subnet-yyy"]}'

# Database URL
aws ssm put-parameter \
  --name "/amplify/{app-id}/{branch}/databaseUrl" \
  --type "SecureString" \
  --value "postgresql://username:password@host:5432/dbname"
```

#### Setting Environment Variables (Alternative)

For local development or custom deployments, set environment variables:

```bash
export AMPLIFY_VPC_CONFIG='{"SecurityGroupIds":["sg-xxx"],"SubnetIds":["subnet-yyy"]}'
export AMPLIFY_DATABASE_URL="postgresql://username:password@host:5432/dbname"
```

#### Deploy Commands

```bash
# Start Amplify sandbox (for development)
npm run amplify:sandbox

# Or deploy to AWS (for production)
npm run amplify:deploy
```

After deployment, Amplify will generate `amplify_outputs.json` with your AppSync Events API endpoint.

### 6. Configure Frontend

The Amplify CLI automatically creates `amplify_outputs.json` with the Events API configuration. The frontend will read this file to connect to the WebSocket.

Alternatively, manually set environment variables:

```env
NEXT_PUBLIC_APPSYNC_EVENTS_ENDPOINT=wss://your-events-api.appsync-api.region.amazonaws.com/graphql
NEXT_PUBLIC_APPSYNC_API_KEY=your-api-key
```

### 7. Run Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to see your blog platform.

## Project Structure

```
├── amplify/
│   ├── backend.ts              # Amplify backend configuration
│   ├── auth/
│   │   └── resource.ts         # Cognito authentication config
│   └── events/
│       ├── resource.ts         # Lambda function definition
│       ├── handler.ts          # Lambda handler with tRPC server
│       ├── package.json        # Lambda dependencies
│       └── tsconfig.json       # Lambda TypeScript config
├── src/
│   ├── app/                    # Next.js app router pages
│   │   ├── layout.tsx          # Root layout with navigation
│   │   ├── page.tsx            # Home page (post list)
│   │   ├── admin/
│   │   │   └── page.tsx        # Admin user management
│   │   ├── posts/
│   │   │   ├── [slug]/
│   │   │   │   └── page.tsx    # Post detail page
│   │   │   └── new/
│   │   │       └── page.tsx    # Create post page with tags
│   │   ├── tags/
│   │   │   ├── page.tsx        # Browse all tags
│   │   │   ├── [slug]/
│   │   │   │   └── page.tsx    # Tag detail with posts
│   │   │   └── manage/
│   │   │       └── page.tsx    # Tag management
│   │   └── users/
│   │       └── [id]/
│   │           └── page.tsx    # User profile (view/edit)
│   ├── components/
│   │   ├── AdminUserManagement.tsx  # Admin interface
│   │   ├── CommentSection.tsx       # Comments component
│   │   └── Navbar.tsx               # Navigation bar
│   ├── lib/
│   │   ├── hooks/
│   │   │   └── useIsAdmin.ts   # Admin role check hook
│   │   └── trpc/
│   │       ├── provider.tsx    # tRPC React Query provider
│   │       └── appsync-ws-link.ts  # WebSocket adapter
│   └── server/
│       ├── db/
│       │   ├── schema.ts       # Drizzle database schema
│       │   ├── index.ts        # Database connection
│       │   └── migrate.ts      # Migration runner
│       └── trpc/
│           ├── trpc.ts         # tRPC initialization & middleware
│           └── routers/
│               ├── index.ts    # Main router
│               ├── admin.ts    # Admin procedures (Cognito)
│               ├── posts.ts    # Posts procedures
│               ├── comments.ts # Comments procedures
│               ├── users.ts    # Users procedures
│               └── tags.ts     # Tags procedures
├── drizzle.config.ts           # Drizzle Kit configuration
├── package.json                # Dependencies and scripts
├── ADMIN_INTERFACE.md          # Admin feature documentation
├── ADMIN_GROUP_SETUP.md        # Admin group setup guide
└── tsconfig.json               # TypeScript configuration
```

## Key Implementation Details

### tRPC over AppSync Events WebSocket

The custom WebSocket adapter (`appsync-ws-link.ts`) bridges tRPC client calls to AppSync Events:

1. Client makes tRPC query/mutation
2. Request is serialized and sent over WebSocket
3. AppSync Events routes to Lambda function
4. Lambda executes tRPC procedure
5. Response is sent back through WebSocket
6. Client receives typed response

### Lambda Function Architecture

The Lambda function (`amplify/events/events.ts`) handles:

- **WebSocket Lifecycle**: CONNECT, DISCONNECT, SUBSCRIBE events
- **tRPC Processing**: Parses incoming messages, routes to appropriate procedures
- **Database Operations**: Uses Drizzle ORM to query PostgreSQL
- **Error Handling**: Returns proper tRPC error codes

### Type Safety

Types flow automatically:

```typescript
// Backend defines schema
export const posts = pgTable('posts', { ... });

// tRPC router uses schema types
export const postsRouter = createTRPCRouter({
  list: publicProcedure.query(async ({ ctx }) => { ... })
});

// Frontend gets full type inference
const { data } = trpc.posts.list.useQuery({ limit: 10 });
//    ^? { items: Post[], nextCursor?: number }
```

## Available Scripts

```bash
# Development
npm run dev              # Start Next.js dev server
npm run build            # Build for production
npm run start            # Start production server

# Database
npm run db:generate      # Generate migrations from schema
npm run db:migrate       # Run migrations
npm run db:push          # Push schema changes (dev only)
npm run db:studio        # Open Drizzle Studio

# Amplify
npm run amplify:sandbox  # Start Amplify sandbox
npm run amplify:deploy   # Deploy to AWS
```

## Deployment

### Database

Deploy PostgreSQL to:
- AWS RDS
- Railway
- Supabase
- Neon
- Your own server

Update `DATABASE_URL` in Amplify environment variables.

### Amplify Backend

```bash
# Push to git and configure Amplify pipeline
git push origin main
npm run amplify:deploy
```

Make sure to:
1. Configure VPC settings (if Lambda needs to access private resources like RDS)
   - Option A: Store in SSM Parameter Store at `/amplify/{app-id}/{branch}/vpcConfig`
   - Option B: Set `AMPLIFY_VPC_CONFIG` environment variable
2. Configure database connection
   - Option A: Store in SSM Parameter Store at `/amplify/{app-id}/{branch}/databaseUrl` (recommended for security)
   - Option B: Set `AMPLIFY_DATABASE_URL` environment variable
3. Ensure `amplify_outputs.json` is generated with correct AppSync Events endpoint
4. Configure any additional environment variables as needed

**Note:** When using SSM parameters, Amplify CI automatically loads them into the `secrets` environment variable during build time. The backend code will parse and apply these configurations automatically.

## Future Enhancements

- [x] User authentication with AWS Cognito (implemented)
- [x] Efficient data fetching with React Query polling (implemented)
- [ ] Real-time subscriptions for live updates (WebSocket infrastructure ready)
- [ ] Post drafts and scheduled publishing
- [ ] Rich text editor (TipTap or similar)
- [ ] Image uploads to S3
- [ ] Email notifications
- [ ] Social sharing
- [ ] SEO optimization
- [ ] RSS feed
- [ ] Analytics integration

## Troubleshooting

### WebSocket Connection Issues

- Check `NEXT_PUBLIC_APPSYNC_EVENTS_ENDPOINT` is set correctly
- Verify AWS credentials have AppSync permissions
- Check CloudWatch logs for Lambda errors

### Database Connection Issues

- Verify `DATABASE_URL` format (or `AMPLIFY_DATABASE_URL`)
- Check PostgreSQL is running and accessible
- Ensure security groups allow Lambda to access RDS
- For VPC-configured Lambdas, verify VPC configuration includes correct security groups and subnets
- Check CloudWatch logs for connection errors

### Configuration Issues

- If VPC config is not applied, verify the JSON format matches the expected structure
- Check build logs for configuration source messages (secrets, environment variables, or defaults)
- Ensure SSM parameters are at the correct path: `/amplify/{app-id}/{branch}/vpcConfig` or `/amplify/{app-id}/{branch}/databaseUrl`
- For SSM parameters, verify IAM permissions allow Amplify to read them

### Type Errors

- Run `npm run db:generate` after schema changes
- Restart TypeScript server in VS Code
- Clear `.next` cache: `rm -rf .next`

## License

MIT

## Contributing

Contributions welcome! Please open an issue or PR.
