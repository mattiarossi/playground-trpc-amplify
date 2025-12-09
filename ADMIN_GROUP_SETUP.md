# Admin Group Setup Guide

This guide explains how to set up and manage the admin group for accessing the admin user management interface.

## Overview

The application uses Cognito groups to control access to admin features. Only users who are members of the `admin` group can:
- Access the `/admin` page
- View and manage Cognito users
- Perform admin operations (create, delete, reset passwords, manage MFA)

## Setup Steps

### 1. Deploy Your Application

First, ensure your Amplify backend is deployed:

```bash
# For sandbox environment
npm run amplify:sandbox

# For production
npm run amplify:deploy
```

### 2. Create the Admin Group

After deployment, you need to create the `admin` group in your Cognito User Pool.

#### Option A: Using AWS Console

1. Go to [AWS Cognito Console](https://console.aws.amazon.com/cognito)
2. Select your User Pool
3. Navigate to **Groups** in the left sidebar
4. Click **Create group**
5. Enter `admin` as the group name
6. (Optional) Add a description
7. Click **Create group**

#### Option B: Using AWS CLI

```bash
# Get your User Pool ID from amplify_outputs.json or AWS Console
USER_POOL_ID="us-east-1_XXXXXXXXX"

# Create the admin group
aws cognito-idp create-group \
  --group-name admin \
  --user-pool-id $USER_POOL_ID \
  --description "Administrator group with full access"
```

### 3. Add Users to Admin Group

#### Option A: Using AWS Console

1. In Cognito Console, go to your User Pool
2. Click **Users** in the left sidebar
3. Select the user you want to make an admin
4. Click **Add user to group**
5. Select `admin` from the dropdown
6. Click **Add**

#### Option B: Using AWS CLI

```bash
USER_POOL_ID="us-east-1_XXXXXXXXX"
USER_EMAIL="admin@example.com"

# Add user to admin group
aws cognito-idp admin-add-user-to-group \
  --user-pool-id $USER_POOL_ID \
  --username $USER_EMAIL \
  --group-name admin
```

### 4. Verify Admin Access

1. Sign in to your application with an admin user
2. You should see an "Admin" link in the navigation bar
3. Click on it to access the admin interface
4. You should be able to view and manage users

## How It Works

### Backend Protection

**File:** `src/server/trpc/trpc.ts`

The `adminProcedure` middleware checks for admin group membership:

```typescript
export const adminProcedure = t.procedure.use(async ({ ctx, next }) => {
  if (!ctx.user) {
    throw new TRPCError({
      code: 'UNAUTHORIZED',
      message: 'Authentication required',
    });
  }

  const isAdmin = ctx.user.groups?.includes('admin');
  if (!isAdmin) {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: 'Admin access required',
    });
  }

  return next({ ctx: { ...ctx, user: ctx.user } });
});
```

All admin router procedures use `adminProcedure` instead of `protectedProcedure`.

### Frontend Protection

**File:** `src/lib/hooks/useIsAdmin.ts`

The `useIsAdmin` hook checks the user's group membership from their authentication session:

```typescript
const session = await fetchAuthSession();
const groups = session.tokens?.accessToken?.payload['cognito:groups'];
setIsAdmin(groups?.includes('admin') ?? false);
```

**File:** `src/app/admin/page.tsx`

The admin page uses this hook to show an access denied message for non-admin users.

**File:** `src/components/Navbar.tsx`

The Admin link only appears in the navbar if the user is an admin.

## Group Information Flow

1. **Authentication:** User signs in with Cognito
2. **Token Generation:** Cognito includes group membership in JWT access token
3. **Backend:** Lambda extracts groups from `cognito:groups` claim in identity
4. **Context:** Groups are passed to tRPC context
5. **Authorization:** `adminProcedure` checks for `admin` group membership

## Troubleshooting

### Admin link not appearing in navbar

- Verify the user is in the admin group (check Cognito Console)
- Clear browser cache and refresh the page
- Sign out and sign back in to get a fresh token
- Check browser console for errors

### "Access Denied" on admin page

- Ensure user is in the admin group
- Verify the group name is exactly `admin` (case-sensitive)
- Check that the user has signed in after being added to the group

### Backend returns "Admin access required" error

- Check Lambda logs in CloudWatch
- Verify groups are being extracted from identity in `amplify/events/handler.ts`
- Ensure IAM permissions are correctly set up (see backend.ts)
- Test with `console.log(ctx.user.groups)` in the procedure

### User was just added to group but still can't access

- The user needs to sign out and sign back in to get a new token with updated group membership
- JWT tokens contain the groups at the time of authentication

## Managing Multiple Admin Users

You can add multiple users to the admin group:

```bash
# Add multiple admins
aws cognito-idp admin-add-user-to-group \
  --user-pool-id $USER_POOL_ID \
  --username admin1@example.com \
  --group-name admin

aws cognito-idp admin-add-user-to-group \
  --user-pool-id $USER_POOL_ID \
  --username admin2@example.com \
  --group-name admin
```

## Removing Admin Access

### Using AWS Console
1. Go to User Pool > Users
2. Select the user
3. Find the admin group assignment
4. Click **Remove from group**

### Using AWS CLI
```bash
aws cognito-idp admin-remove-user-from-group \
  --user-pool-id $USER_POOL_ID \
  --username user@example.com \
  --group-name admin
```

## Security Best Practices

1. **Limit Admin Users:** Only add trusted users to the admin group
2. **Audit Access:** Regularly review who has admin access
3. **Use MFA:** Enable MFA for admin accounts
4. **Monitor Activity:** Check CloudWatch logs for admin operations
5. **Rotate Credentials:** Periodically require admin users to change passwords
6. **Least Privilege:** Consider creating additional groups with limited permissions

## Additional Groups

You can create additional groups for different permission levels:

```bash
# Create a moderator group
aws cognito-idp create-group \
  --group-name moderator \
  --user-pool-id $USER_POOL_ID

# Create a viewer group
aws cognito-idp create-group \
  --group-name viewer \
  --user-pool-id $USER_POOL_ID
```

Then implement similar middleware in `trpc.ts`:
```typescript
export const moderatorProcedure = t.procedure.use(async ({ ctx, next }) => {
  const isModerator = ctx.user?.groups?.includes('moderator') || 
                      ctx.user?.groups?.includes('admin');
  if (!isModerator) {
    throw new TRPCError({ code: 'FORBIDDEN', message: 'Moderator access required' });
  }
  return next({ ctx });
});
```

## Related Files

- `amplify/auth/resource.ts` - Cognito configuration
- `src/server/trpc/trpc.ts` - Admin middleware
- `src/server/trpc/routers/admin.ts` - Admin router
- `src/lib/hooks/useIsAdmin.ts` - Frontend admin check
- `src/app/admin/page.tsx` - Admin page
- `src/components/Navbar.tsx` - Navigation with conditional admin link
- `amplify/events/handler.ts` - Group extraction from identity
