# AppSync Events API Configuration

This file explains how the AppSync Events API is configured for tRPC WebSocket transport.

## Architecture

```
amplify/backend.ts
├── Defines eventsHandler (Lambda function)
├── Creates CfnApi (AppSync Events API)
├── Creates CfnChannelNamespace (default namespace)
├── Grants Lambda permissions
└── Exports configuration to amplify_outputs.json
```

## Backend Configuration

The `amplify/backend.ts` file uses AWS CDK constructs to define:

### 1. AppSync Events API (`CfnApi`)
- **Name**: `blog-trpc-events-api`
- **Auth**: API Key (for simplicity, can be upgraded to Cognito)
- **Auth Modes**: API_KEY for connect, publish, subscribe

### 2. Channel Namespace (`CfnChannelNamespace`)
- **Name**: `default`
- **Purpose**: Organizes event channels (e.g., `default/trpc`)

### 3. Lambda Handler
- **Function**: `eventsHandler` (defined in `amplify/events/resource.ts`)
- **Entry Point**: `amplify/events/handler.ts`
- **Permissions**: Can connect, subscribe, and publish to Events API

## How tRPC Messages Flow

### Client → Lambda

1. **Client**: tRPC client calls `trpc.posts.list.useQuery()`
2. **WebSocket Link**: Serializes to `{ id, type: 'query', path: 'posts.list', input: {...} }`
3. **AppSync Events**: Routes message to Lambda function via WebSocket
4. **Lambda**: Receives event, parses tRPC request, executes procedure
5. **Response**: Lambda returns tRPC response through WebSocket
6. **Client**: Receives and deserializes response

### Event Types

The Lambda handler processes these AppSync event types:

- `CONNECT`: WebSocket connection established
- `DISCONNECT`: WebSocket connection closed
- `SUBSCRIBE`: Client subscribes to a channel
- `PUBLISH`: Client publishes a message (tRPC requests go here)

## Configuration Output

After deployment, `amplify_outputs.json` contains:

```json
{
  "custom": {
    "events": {
      "url": "https://xxxxx.appsync-api.us-east-1.amazonaws.com/event",
      "aws_region": "us-east-1",
      "default_authorization_type": "API_KEY",
      "api_key": "da2-xxxxxxxxxxxxx"
    }
  }
}
```

## Frontend Configuration

The frontend (`src/lib/trpc/provider.tsx`) reads this configuration and:

1. Configures Amplify with Events API endpoint
2. Creates WebSocket connection to AppSync Events
3. Routes all tRPC calls through the WebSocket

## Deployment

### Sandbox (Development)
```bash
npx ampx sandbox
```

This will:
- Deploy Lambda function
- Create AppSync Events API
- Generate API key
- Output configuration to `amplify_outputs.json`

### Production
```bash
npx ampx pipeline-deploy --branch main
```

## Upgrading to Cognito Auth

To use Cognito instead of API Key:

1. Add auth to backend:
```typescript
import { defineAuth } from '@aws-amplify/backend';
const backend = defineBackend({ auth, eventsHandler });
```

2. Update CfnApi auth providers:
```typescript
authProviders: [
  {
    authType: AuthorizationType.USER_POOL,
    cognitoConfig: {
      awsRegion: eventsStack.region,
      userPoolId: backend.auth.resources.userPool.userPoolId,
    },
  },
],
```

3. Update frontend to use Authenticator component

## Troubleshooting

### "Unable to connect to WebSocket"
- Check that `npx ampx sandbox` is running
- Verify `amplify_outputs.json` exists and has correct endpoint
- Check Lambda CloudWatch logs for errors

### "API Key expired"
- Regenerate API key in AWS Console
- Or switch to Cognito authentication

### "tRPC procedure not found"
- Check Lambda logs to see incoming request
- Verify path matches router definition (e.g., `posts.list`)
- Ensure Lambda has correct DATABASE_URL environment variable
