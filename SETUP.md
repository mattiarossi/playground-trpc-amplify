# Setup Guide - Blog Platform with tRPC + Amplify

This guide will walk you through setting up the blog platform from scratch.

## Step 1: Clone and Install

```bash
# Install dependencies
npm install

# Or using yarn/pnpm
yarn install
pnpm install
```

## Step 2: Database Setup

### Option A: Local PostgreSQL

1. Install PostgreSQL:
   ```bash
   # macOS
   brew install postgresql@15
   brew services start postgresql@15

   # Ubuntu/Debian
   sudo apt install postgresql postgresql-contrib
   sudo systemctl start postgresql

   # Windows
   # Download from https://www.postgresql.org/download/windows/
   ```

2. Create database:
   ```bash
   psql postgres
   CREATE DATABASE blog_db;
   CREATE USER blog_user WITH PASSWORD 'your_password';
   GRANT ALL PRIVILEGES ON DATABASE blog_db TO blog_user;
   \q
   ```

3. Set connection string:
   ```bash
   echo "DATABASE_URL=postgresql://blog_user:your_password@localhost:5432/blog_db" > .env
   ```

### Option B: Cloud Database

#### Railway.app (Recommended for development)

1. Go to [railway.app](https://railway.app)
2. Create new project → Add PostgreSQL
3. Copy connection string from Variables tab
4. Add to `.env`:
   ```env
   DATABASE_URL=postgresql://postgres:password@host:port/railway
   ```

#### Neon (Serverless PostgreSQL)

1. Go to [neon.tech](https://neon.tech)
2. Create new project
3. Copy connection string
4. Add to `.env`

#### Supabase

1. Go to [supabase.com](https://supabase.com)
2. Create new project
3. Go to Project Settings → Database
4. Copy connection string (make sure to use "connection pooling" URL)
5. Add to `.env`

## Step 3: Initialize Database Schema

```bash
# Generate migration files
npm run db:generate

# Apply migrations
npm run db:migrate

# Or push schema directly (for development)
npm run db:push
```

## Step 4: Seed Initial Data

Open Drizzle Studio to add test data:

```bash
npm run db:studio
```

Or create a seed script `src/server/db/seed.ts`:

```typescript
import { db } from './index';
import { users, posts, tags, postsTags } from './schema';

async function seed() {
  // Create a test user
  const [user] = await db.insert(users).values({
    email: 'john@example.com',
    name: 'John Doe',
    bio: 'Software developer and blogger',
  }).returning();

  // Create tags
  const [tech] = await db.insert(tags).values({
    name: 'Technology',
    slug: 'technology',
  }).returning();

  const [tutorial] = await db.insert(tags).values({
    name: 'Tutorial',
    slug: 'tutorial',
  }).returning();

  // Create a post
  const [post] = await db.insert(posts).values({
    title: 'Getting Started with tRPC',
    slug: 'getting-started-with-trpc',
    content: '<p>This is a comprehensive guide to getting started with tRPC...</p>',
    excerpt: 'Learn how to build type-safe APIs with tRPC',
    published: true,
    authorId: user.id,
  }).returning();

  // Associate tags
  await db.insert(postsTags).values([
    { postId: post.id, tagId: tech.id },
    { postId: post.id, tagId: tutorial.id },
  ]);

  console.log('✅ Database seeded successfully!');
}

seed().catch(console.error).finally(() => process.exit());
```

Run it:
```bash
tsx src/server/db/seed.ts
```

## Step 5: AWS Setup

### Configure AWS Credentials

```bash
# Install AWS CLI
brew install awscli  # macOS
# or download from https://aws.amazon.com/cli/

# Configure credentials
aws configure
# Enter your AWS Access Key ID
# Enter your AWS Secret Access Key
# Enter default region (e.g., us-east-1)
# Enter default output format: json
```

### Install Amplify CLI

```bash
npm install -g @aws-amplify/cli
amplify configure
```

## Step 6: Deploy Amplify Backend

### Development (Sandbox)

```bash
npm run amplify:sandbox
```

This will:
1. Deploy Lambda function with tRPC server
2. Create AppSync Events API
3. Generate `amplify_outputs.json`
4. Hot-reload on code changes

Keep this running during development.

### Production

```bash
npm run amplify:deploy
```

Or set up CI/CD:
1. Push code to GitHub
2. Go to AWS Amplify Console
3. Connect repository
4. Configure build settings
5. Deploy

## Step 7: Configure Environment Variables

### Backend Environment (Lambda)

Set in `amplify/backend.ts` or via AWS Console:

```typescript
environment: {
  DATABASE_URL: 'your-production-db-url',
  NODE_ENV: 'production',
}
```

### Frontend Environment

After Amplify deployment, copy values to `.env.local`:

```env
NEXT_PUBLIC_APPSYNC_EVENTS_ENDPOINT=wss://xxxxx.appsync-api.us-east-1.amazonaws.com/event
NEXT_PUBLIC_APPSYNC_API_KEY=da2-xxxxx
```

Or Amplify will auto-generate `amplify_outputs.json`.

## Step 8: Run Development Server

```bash
npm run dev
```

Visit [http://localhost:3000](http://localhost:3000)

## Step 9: Test the Application

1. **View Posts**: Homepage should list posts (or show "no posts" if empty)
2. **Create Post**: Click "New Post" button
3. **View Post Detail**: Click on a post title
4. **Add Comment**: Scroll down on post detail page
5. **Test WebSocket**: Open browser DevTools → Network → WS tab to see WebSocket connection

## Step 10: Deploy Frontend

### Amplify Hosting

The frontend is automatically deployed with the backend when using Amplify CI/CD (configured in Step 6).

Alternatively, you can deploy to other platforms:
- Netlify
- Cloudflare Pages
- Your own server

Make sure to configure environment variables properly on your chosen platform.

## Verification Checklist

- [ ] Database is accessible and schema is applied
- [ ] Amplify backend is deployed (Lambda + AppSync Events)
- [ ] `amplify_outputs.json` exists in project root
- [ ] Next.js dev server runs without errors
- [ ] Can access homepage at localhost:3000
- [ ] WebSocket connection shows in Network tab
- [ ] Can create a new post
- [ ] Can view post details
- [ ] Can add comments
- [ ] No console errors in browser DevTools

## Common Issues

### "Cannot find module" errors

```bash
# Clear node_modules and reinstall
rm -rf node_modules package-lock.json
npm install
```

### "DATABASE_URL is not set"

Make sure `.env` exists and has correct format:
```env
DATABASE_URL=postgresql://user:password@host:port/database
```

### WebSocket connection fails

1. Check `NEXT_PUBLIC_APPSYNC_EVENTS_ENDPOINT` is set
2. Verify Amplify backend is deployed
3. Check AWS credentials are valid
4. Look at Lambda logs in CloudWatch

### Lambda can't connect to database

1. If using RDS, add Lambda security group to RDS allowed connections
2. If using public database, make sure it's accessible from AWS
3. Check DATABASE_URL in Lambda environment variables

### TypeScript errors

```bash
# Regenerate types
npm run db:generate

# Restart TypeScript server in VS Code
# Cmd+Shift+P → "TypeScript: Restart TS Server"

# Clear Next.js cache
rm -rf .next
```

## Next Steps

- Add authentication with AWS Cognito
- Set up custom domain
- Configure CDN and caching
- Add monitoring and alerting
- Implement CI/CD pipeline
- Add tests (Jest, Playwright)
- Set up staging environment

## Support

For issues or questions:
1. Check the main README.md
2. Look at CloudWatch logs for Lambda errors
3. Check browser console for frontend errors
4. Open an issue on GitHub
