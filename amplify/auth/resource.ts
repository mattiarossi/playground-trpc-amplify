import { defineAuth } from '@aws-amplify/backend';

/**
 * Cognito User Pool configuration for authentication
 * 
 * Note: To enable admin functionality, you need to manually create an 'admin' group
 * in the Cognito User Pool and add users to it. This can be done via:
 * - AWS Console: Cognito > User Pools > Groups
 * - AWS CLI: aws cognito-idp create-group --group-name admin --user-pool-id <pool-id>
 * - AWS CLI: aws cognito-idp admin-add-user-to-group --user-pool-id <pool-id> --username <email> --group-name admin
 */
export const auth = defineAuth({
  loginWith: {
    email: true,
  },
  userAttributes: {
    email: {
      required: true,
      mutable: true,
    }
  },
  groups: ['admin'],
});
