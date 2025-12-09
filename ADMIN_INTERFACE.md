# Admin Interface

This document describes the admin interface for managing Cognito users and posts through tRPC.

## Overview

The admin interface allows authenticated admin users to:
- Manage registered users in AWS Cognito
- Manage posts from all users (publish, unpublish, delete)
- Access admin-only features through a dedicated navigation section

All operations communicate via tRPC procedures over WebSocket connections.

## Architecture

### Backend

#### Admin Router (`src/server/trpc/routers/admin.ts`)

Handles Cognito user management operations:

#### Queries (Read Operations)
- **`listUsers`** - List users with pagination
  - Input: `{ limit?: number, paginationToken?: string }`
  - Returns paginated user list

- **`listAllUsers`** - Get all users (handles pagination automatically)
  - Returns complete user list

- **`getUserMfaStatus`** - Get MFA status for a specific user
  - Input: `{ username: string }`
  - Returns MFA configuration details

#### Mutations (Write Operations)
- **`createUser`** - Create a new Cognito user
  - Input: `{ username: string (email), temporaryPassword?: string, sendEmail?: boolean }`
  - Creates user and optionally sends welcome email

- **`deleteUser`** - Delete a Cognito user
  - Input: `{ username: string }`
  - Permanently removes user from Cognito

- **`resetUserPassword`** - Send password reset email
  - Input: `{ username: string }`
  - Triggers password reset flow

- **`resendConfirmationCode`** - Resend account confirmation
  - Input: `{ username: string }`
  - Resends verification email

- **`enableUserMfa`** - Enable MFA for a user
  - Input: `{ username: string, mfaType?: 'SOFTWARE_TOKEN' | 'SMS' }`
- **`disableUserMfa`** - Disable MFA for a user
  - Input: `{ username: string }`
  - Disables multi-factor authentication

#### Posts Router (`src/server/trpc/routers/posts.ts`)

Admin-only procedures for post management:

A full-featured admin UI component with:
- User list table with real-time data
- Create user form
- Inline user actions (reset password, MFA toggle, delete)
- Status indicators and loading states
- Confirmation dialogs for destructive actions

#### Post Management Page (`src/app/admin/posts/page.tsx`)

A comprehensive admin panel for managing all posts:
- List of all posts from all users
- Search functionality by title/content
- Filter to show/hide unpublished posts
- Each post displays:
  - Title, author, timestamps, view count, tags
  - Draft badge for unpublished posts
  - Author profile link
- Management actions:
  - Publish/Unpublish
  - View post
  - Delete post
- Confirmation dialogs for all actions

#### Post Detail Page (`src/app/posts/[slug]/page.tsx`)

Enhanced with admin controls:
- Admin users see management buttons when viewing other users' posts
- Buttons for publish/unpublish/delete
- Edit button only shown to post authors
- Admin buttons hidden on admin's own posts (shows normal author controls)

#### Sidebar Navigation (`src/components/Sidebar.tsx`)

## Usage

### Accessing the Admin Interface

Admin features are accessible through the sidebar navigation under the "Administration" section. 

**Requirements:**
- Must be authenticated
- Must be a member of the `admin` Cognito group

### User Management (`/admin`)

**Creating a User:**
1. Click "New User" button
2. Enter email address
3. Click "Create User"
4. User will receive a welcome email with temporary password

**Managing Users:**
- **Reset Password:** Click "Reset Password" - user receives email with reset code
- **Toggle MFA:** Click "Enable MFA" or "Disable MFA" - changes user's MFA requirement
- **Delete User:** Click "Delete" and confirm - permanently removes user from Cognito

### Post Management (`/admin/posts`)

**Viewing All Posts:**
1. Navigate to "Manage All Posts" in the sidebar
2. See all posts from all users, including drafts
3. Use search box to filter posts by title/content
4. Toggle "Show unpublished posts" to filter drafts

**Managing Posts:**
- **Publish/Unpublish:** Click the publish/unpublish button for any post
- **View Post:** Click "View" to navigate to the post detail page
- **Delete Post:** Click "Delete" and confirm - permanently removes the post

**Admin Actions on Post Detail Pages:**
- When viewing another user's post, admin users see management buttons
- Publish/unpublish/delete actions available
- Edit button is NOT shown (admins cannot edit other users' posts)
- On admin's own posts, normal author controls are shown instead
### Route (`src/app/admin/page.tsx`)

Admin interface accessible at `/admin` route.

## Usage

### Accessing the Admin Interface

Navigate to `/admin` in your application. Ensure you're authenticated with appropriate permissions.

### Creating a User

1. Click "New User" button
2. Enter email address
3. Click "Create User"
4. User will receive a welcome email with temporary password

### Managing Users

**Reset Password:**
- Click "Reset Password" next to any user
- User receives email with reset code

**Toggle MFA:**
- Click "Enable MFA" or "Disable MFA"
- Changes user's MFA requirement

**Delete User:**
- Click "Delete" next to any user
- Confirm deletion in dialog
- User is permanently removed from Cognito

## Configuration

### Environment Variables
### Post Management Authorization

Admin users can:
- ✅ Publish/unpublish any user's posts
- ✅ Delete any user's posts
- ✅ View all posts (including unpublished drafts)
- ❌ Cannot edit other users' posts (content remains author-controlled)

Edit restrictions are enforced at:
- Backend: Edit page checks `postData.authorId !== authorId`
- Frontend: Edit button only shown to post authors

### Permissions

To use admin operations, the Lambda execution role or IAM user needs these permissions:

**Cognito permissions:**
- AWS Region: `outputs.auth.aws_region`

### Authentication & Authorization

All admin procedures use the `adminProcedure` middleware which requires:
1. User must be authenticated
2. User must be a member of the `admin` Cognito group

**Important:** You must set up the admin group in Cognito before users can access admin features.
See [ADMIN_GROUP_SETUP.md](./ADMIN_GROUP_SETUP.md) for detailed instructions.

### Permissions

To use admin operations, the Lambda execution role or IAM user needs these Cognito permissions:
```json
{
  "Version": "2012-10-17",
}
```

**Database permissions:**
- Admin procedures use `adminProcedure` middleware
- Full read/write access to posts table for admin operations

## Dependencies [
        "cognito-idp:ListUsers",
## API Reference

### Admin Procedures

All admin procedures use the `adminProcedure` middleware which:
1. Validates user authentication
2. Checks for `admin` group membership
3. Throws `FORBIDDEN` error if not authorized

### User Object StructurenResetUserPassword",
        "cognito-idp:AdminGetUser",
        "cognito-idp:AdminSetUserMFAPreference"
      ],
      "Resource": "arn:aws:cognito-idp:REGION:ACCOUNT_ID:userpool/USER_POOL_ID"
    }
  ]
}
```

## Dependencies

- `@aws-sdk/client-cognito-identity-provider` - AWS SDK for Cognito operations
- `@trpc/server` & `@trpc/client` - tRPC framework
- `zod` - Input validation

## API Reference

### User Object Structure

```typescript
### Post Object Structure

```typescript
interface Post {
  id: number;
  title: string;
  slug: string;
  content: string;
  excerpt?: string;
  published: boolean;
  authorId: string;
  createdAt: Date;
  updatedAt: Date;
  viewCount: number;
  author: {
    id: string;
    name: string;
    email: string;
    avatarUrl?: string;
  };
  postsTags: Array<{
    tag: {
      id: number;
      name: string;
      slug: string;
    };
## Security Considerations

1. **Authentication Required:** All admin procedures require authenticated users
2. **Role-Based Access:** `adminProcedure` enforces `admin` group membership
3. **Post Editing Restricted:** Admins cannot edit other users' posts (only manage status)
4. **Audit Logging:** Consider logging all admin operations for compliance
5. **Rate Limiting:** Consider implementing rate limits on destructive operations
6. **Input Validation:** All inputs validated with Zod schemas
7. **Confirmation Dialogs:** All destructive actions require user confirmation
const result = await trpc.admin.createUser.mutate({
  username: 'user@example.com',
  sendEmail: true
});
```

## Extending the Interface

### Adding New Cognito Operations

1. Import the appropriate command from AWS SDK
2. Add procedure to `adminRouter` in `admin.ts`
3. Add UI controls in `AdminUserManagement.tsx`
4. Update this documentation

## Troubleshooting

**Users not loading:**
- Check AWS credentials and region configuration
- Verify User Pool ID in `amplify_outputs.json`
- Check IAM permissions for Cognito operations

**Posts not loading:**
- Verify user is authenticated and in `admin` group
- Check browser console for tRPC errors
- Verify database connection is working

**Admin features not showing:**
- Verify user is in the `admin` Cognito group
- Check that `useIsAdmin` hook is working
- Ensure Cognito groups are included in JWT tokens

**Operations failing:**
- Check browser console for tRPC errors
- Verify WebSocket connection is active
- Ensure user has `admin` group membership
- Check confirmation dialogs aren't being blocked

**Cannot edit other users' posts (expected):**
- This is by design - admins can only manage (publish/delete), not edit
- Only post authors can edit content

**MFA operations not working:**
- Verify MFA is enabled in Cognito User Pool settings
- Check user's MFA configuration in Cognito console
// Publish a post
await trpc.posts.adminPublish.mutate({ id: postId });

// Unpublish a post
await trpc.posts.adminUnpublish.mutate({ id: postId });

// Delete a post
await trpc.posts.adminDelete.mutate({ id: postId });
```st result = await trpc.admin.createUser.mutate({
  username: 'user@example.com',
  sendEmail: true
});
```

### Example: Listing All Users

```typescript
const { data } = trpc.admin.listAllUsers.useQuery();
const users = data?.users || [];
```

## Error Handling

All procedures wrap Cognito SDK calls with try-catch blocks and throw `TRPCError` with appropriate error codes:
- `INTERNAL_SERVER_ERROR` - AWS SDK or Cognito errors
- Error messages include details from the underlying service

## Security Considerations

1. **Authentication Required:** All procedures require authenticated users
2. **Role-Based Access:** Consider adding admin role checks to `protectedProcedure`
3. **Audit Logging:** Consider logging all admin operations
4. **Rate Limiting:** Implement rate limits on user creation/deletion
5. **Input Validation:** All inputs validated with Zod schemas

## Extending the Interface
## Development

To test locally:
```bash
npm run dev
```

Navigate to:
- `http://localhost:3000/admin` - User management
- `http://localhost:3000/admin/posts` - Post management

**Testing Admin Features:**
1. Sign in with a user account
2. Add user to `admin` group in Cognito console
3. Refresh the page to load new group membership
4. Admin section should appear in sidebar

## Production Deployment

Before deploying:
1. Ensure proper IAM permissions are configured for Cognito operations
2. Verify database permissions for post management
3. Test admin group membership detection
4. Enable CloudWatch logging for audit trails
5. Consider adding rate limiting for destructive operations
6. Test all admin operations in staging environment
7. Document admin users and their responsibilities
8. Set up monitoring for admin actions
- Verify WebSocket connection is active
- Ensure user has required permissions

**MFA operations not working:**
- Verify MFA is enabled in Cognito User Pool settings
- Check user's MFA configuration in Cognito console

## Development

To test locally:
```bash
npm run dev
```

Navigate to `http://localhost:3000/admin`

## Production Deployment

Before deploying:
1. Ensure proper IAM permissions are configured
2. Review and restrict admin access with role-based checks
3. Enable CloudWatch logging for audit trails
4. Consider adding rate limiting
5. Test all operations in staging environment
