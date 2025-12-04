import { defineAuth } from '@aws-amplify/backend';

/**
 * Cognito User Pool configuration for authentication
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
});
