import { z } from 'zod';
import { createTRPCRouter, adminProcedure } from '../trpc';
import { TRPCError } from '@trpc/server';
import {
  CognitoIdentityProviderClient,
  AdminCreateUserCommand,
  AdminDeleteUserCommand,
  ListUsersCommand,
  AdminSetUserMFAPreferenceCommand,
  AdminResetUserPasswordCommand,
  AdminGetUserCommand,
} from '@aws-sdk/client-cognito-identity-provider';
import outputs from '../../../../amplify_outputs.json';

// Initialize Cognito client
const cognitoClient = new CognitoIdentityProviderClient({
  region: outputs.auth.aws_region,
});

const USER_POOL_ID = outputs.auth.user_pool_id;

/**
 * Admin router for Cognito user management
 * All procedures require authentication
 */
export const adminRouter = createTRPCRouter({
  /**
   * List all users in the Cognito User Pool
   */
  listUsers: adminProcedure
    .input(
      z.object({
        limit: z.number().min(1).max(60).optional().default(60),
        paginationToken: z.string().optional(),
      })
    )
    .query(async ({ input }) => {
      try {
        const command = new ListUsersCommand({
          UserPoolId: USER_POOL_ID,
          Limit: input.limit,
          PaginationToken: input.paginationToken,
        });

        const response = await cognitoClient.send(command);

        return {
          users: response.Users?.map((user) => ({
            username: user.Username,
            email: user.Attributes?.find((attr) => attr.Name === 'email')?.Value,
            status: user.UserStatus,
            enabled: user.Enabled,
            createdDate: user.UserCreateDate,
            lastModifiedDate: user.UserLastModifiedDate,
            mfaOptions: user.MFAOptions,
          })) || [],
          paginationToken: response.PaginationToken,
        };
      } catch (error: any) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: `Failed to list users: ${error.message}`,
        });
      }
    }),

  /**
   * Get all users with pagination handling
   */
  listAllUsers: adminProcedure.query(async () => {
    try {
      let users: any[] = [];
      let paginationToken: string | undefined;

      do {
        const command = new ListUsersCommand({
          UserPoolId: USER_POOL_ID,
          Limit: 60,
          PaginationToken: paginationToken,
        });

        const response = await cognitoClient.send(command);
        
        users = users.concat(
          response.Users?.map((user) => ({
            username: user.Username,
            email: user.Attributes?.find((attr) => attr.Name === 'email')?.Value,
            status: user.UserStatus,
            enabled: user.Enabled,
            createdDate: user.UserCreateDate,
            lastModifiedDate: user.UserLastModifiedDate,
            mfaOptions: user.MFAOptions,
          })) || []
        );

        paginationToken = response.PaginationToken;
      } while (paginationToken);

      return { users };
    } catch (error: any) {
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: `Failed to list all users: ${error.message}`,
      });
    }
  }),

  /**
   * Create a new Cognito user
   */
  createUser: adminProcedure
    .input(
      z.object({
        username: z.string().email(),
        temporaryPassword: z.string().optional(),
        sendEmail: z.boolean().optional().default(true),
      })
    )
    .mutation(async ({ input }) => {
      try {
        const command = new AdminCreateUserCommand({
          UserPoolId: USER_POOL_ID,
          Username: input.username,
          UserAttributes: [
            {
              Name: 'email',
              Value: input.username,
            },
            {
              Name: 'email_verified',
              Value: 'true',
            },
          ],
          TemporaryPassword: input.temporaryPassword,
          DesiredDeliveryMediums: input.sendEmail ? ['EMAIL'] : undefined,
        });

        const response = await cognitoClient.send(command);

        return {
          username: response.User?.Username,
          status: response.User?.UserStatus,
          message: 'User created successfully',
        };
      } catch (error: any) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: `Failed to create user: ${error.message}`,
        });
      }
    }),

  /**
   * Delete a Cognito user
   */
  deleteUser: adminProcedure
    .input(
      z.object({
        username: z.string(),
      })
    )
    .mutation(async ({ input }) => {
      try {
        const command = new AdminDeleteUserCommand({
          UserPoolId: USER_POOL_ID,
          Username: input.username,
        });

        await cognitoClient.send(command);

        return {
          success: true,
          message: `User ${input.username} deleted successfully`,
        };
      } catch (error: any) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: `Failed to delete user: ${error.message}`,
        });
      }
    }),

  /**
   * Reset user password
   */
  resetUserPassword: adminProcedure
    .input(
      z.object({
        username: z.string(),
      })
    )
    .mutation(async ({ input }) => {
      try {
        const command = new AdminResetUserPasswordCommand({
          UserPoolId: USER_POOL_ID,
          Username: input.username,
        });

        await cognitoClient.send(command);

        return {
          success: true,
          message: `Password reset for ${input.username}. User will receive a reset code via email.`,
        };
      } catch (error: any) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: `Failed to reset password: ${error.message}`,
        });
      }
    }),

  /**
   * Resend confirmation code
   */
  resendConfirmationCode: adminProcedure
    .input(
      z.object({
        username: z.string(),
      })
    )
    .mutation(async ({ input }) => {
      try {
        const command = new AdminCreateUserCommand({
          UserPoolId: USER_POOL_ID,
          Username: input.username,
          MessageAction: 'RESEND',
          UserAttributes: [
            {
              Name: 'email',
              Value: input.username,
            },
            {
              Name: 'email_verified',
              Value: 'true',
            },
          ],
        });

        await cognitoClient.send(command);

        return {
          success: true,
          message: `Confirmation code resent to ${input.username}`,
        };
      } catch (error: any) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: `Failed to resend confirmation: ${error.message}`,
        });
      }
    }),

  /**
   * Get user's MFA status
   */
  getUserMfaStatus: adminProcedure
    .input(
      z.object({
        username: z.string(),
      })
    )
    .query(async ({ input }) => {
      try {
        const command = new AdminGetUserCommand({
          UserPoolId: USER_POOL_ID,
          Username: input.username,
        });

        const userData = await cognitoClient.send(command);

        return {
          username: input.username,
          mfaEnabled: userData.UserMFASettingList || [],
          preferredMfa: userData.PreferredMfaSetting || 'NONE',
        };
      } catch (error: any) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: `Failed to get MFA status: ${error.message}`,
        });
      }
    }),

  /**
   * Enable MFA for a user
   */
  enableUserMfa: adminProcedure
    .input(
      z.object({
        username: z.string(),
        mfaType: z.enum(['SOFTWARE_TOKEN', 'SMS']).default('SOFTWARE_TOKEN'),
      })
    )
    .mutation(async ({ input }) => {
      try {
        const command = new AdminSetUserMFAPreferenceCommand({
          UserPoolId: USER_POOL_ID,
          Username: input.username,
          SoftwareTokenMfaSettings:
            input.mfaType === 'SOFTWARE_TOKEN'
              ? {
                  Enabled: true,
                  PreferredMfa: true,
                }
              : undefined,
          SMSMfaSettings:
            input.mfaType === 'SMS'
              ? {
                  Enabled: true,
                  PreferredMfa: true,
                }
              : undefined,
        });

        await cognitoClient.send(command);

        return {
          success: true,
          message: `MFA enabled for ${input.username}`,
        };
      } catch (error: any) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: `Failed to enable MFA: ${error.message}`,
        });
      }
    }),

  /**
   * Disable MFA for a user
   */
  disableUserMfa: adminProcedure
    .input(
      z.object({
        username: z.string(),
      })
    )
    .mutation(async ({ input }) => {
      try {
        const command = new AdminSetUserMFAPreferenceCommand({
          UserPoolId: USER_POOL_ID,
          Username: input.username,
          SoftwareTokenMfaSettings: {
            Enabled: false,
            PreferredMfa: false,
          },
          SMSMfaSettings: {
            Enabled: false,
            PreferredMfa: false,
          },
        });

        await cognitoClient.send(command);

        return {
          success: true,
          message: `MFA disabled for ${input.username}`,
        };
      } catch (error: any) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: `Failed to disable MFA: ${error.message}`,
        });
      }
    }),
});
