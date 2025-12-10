import * as appsync from 'aws-cdk-lib/aws-appsync';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as cdk from 'aws-cdk-lib/core';
import { defineBackend } from '@aws-amplify/backend';
import { auth } from './auth/resource';
import { eventsHandler } from './events/resource';
import { Events } from './custom/eventapi';
import { Policy, PolicyStatement } from 'aws-cdk-lib/aws-iam';
import * as iam from 'aws-cdk-lib/aws-iam';

export const envName = process.env.ENV_NAME ?? 'trpcSandBox';

/**
 * Default VPC configuration (used as fallback)
 */
const defaultVpcConfig = {
  SecurityGroupIds: [] as string[],
  SubnetIds: [] as string[],
};

/**
 * Get VPC configuration from environment secrets or custom environment variables
 * Priority:
 * 1. process.env.secrets (loaded from SSM by Amplify CI)
 * 2. process.env.AMPLIFY_VPC_CONFIG (custom environment variable)
 * 3. Empty arrays (default)
 * 
 * Amplify CI automatically loads SSM parameters from /amplify/{app-id}/{branch}/
 * into the 'secrets' environment variable during build time
 * @returns VPC configuration object
 */
function getVpcConfig() {
  const secretsEnv = process.env.secrets;
  
  // Try to get from secrets (Amplify CI loads from SSM)
  if (secretsEnv) {
    try {
      const secrets = JSON.parse(secretsEnv);
      if (secrets.vpcConfig) {
        console.log('Using VPC config from secrets (loaded from SSM by Amplify CI)');
        // vpcConfig might be a JSON string, so parse it if needed
        if (typeof secrets.vpcConfig === 'string') {
          try {
            return JSON.parse(secrets.vpcConfig);
          } catch (parseError) {
            console.warn('Failed to parse vpcConfig string, falling back to next option:', parseError);
          }
        } else {
          return secrets.vpcConfig;
        }
      }
    } catch (error) {
      console.warn('Failed to parse secrets environment variable, falling back to next option:', error);
    }
  }
  
  // Try to get from custom environment variable
  const customVpcConfig = process.env.AMPLIFY_VPC_CONFIG;
  if (customVpcConfig) {
    try {
      console.log('Using VPC config from AMPLIFY_VPC_CONFIG environment variable');
      return JSON.parse(customVpcConfig);
    } catch (error) {
      console.warn('Failed to parse AMPLIFY_VPC_CONFIG, falling back to default:', error);
    }
  }
  
  console.log('Using default VPC config (empty arrays)');
  return defaultVpcConfig;
}

/**
 * Get database URL from environment secrets or custom environment variables
 * Priority:
 * 1. process.env.secrets (loaded from SSM by Amplify CI)
 * 2. process.env.AMPLIFY_DATABASE_URL (custom environment variable)
 * 3. Empty string (default)
 * 
 * @returns Database URL string
 */
function getDatabaseUrl(): string {
  const secretsEnv = process.env.secrets;
  
  // Try to get from secrets (Amplify CI loads from SSM)
  if (secretsEnv) {
    try {
      const secrets = JSON.parse(secretsEnv);
      if (secrets.databaseUrl) {
        console.log('Using database URL from secrets (loaded from SSM by Amplify CI)');
        return secrets.databaseUrl;
      }
    } catch (error) {
      console.warn('Failed to parse secrets environment variable, falling back to next option:', error);
    }
  }
  
  // Try to get from custom environment variable
  const customDatabaseUrl = process.env.AMPLIFY_DATABASE_URL;
  if (customDatabaseUrl) {
    console.log('Using database URL from AMPLIFY_DATABASE_URL environment variable');
    return customDatabaseUrl;
  }
  
  console.log('Using default database URL (empty string)');
  return '';
}

const vpcConfig = getVpcConfig();
const databaseUrl = getDatabaseUrl();

/**
 * Amplify Gen2 Backend with AppSync Events API for tRPC WebSocket transport
 * 
 * Uses Cognito User Pools for authentication
 * The eventsHandler Lambda function processes:
 * - WebSocket lifecycle (connect, disconnect, subscribe)
 * - All tRPC requests (queries, mutations, subscriptions)
 * - Database operations through Drizzle ORM
 * 
 * @see https://docs.amplify.aws/react/build-a-backend/data/connect-event-api/
 */
const backend = defineBackend({
  auth,
  eventsHandler,
});


export const lambdaPGStatement1 = new iam.PolicyStatement({
  sid: 'AllowVPCandCognitoLambda',
  actions: [
    'ec2:CreateNetworkInterface',
    'ec2:DescribeNetworkInterfaces',
    'ec2:DeleteNetworkInterface',
    'cognito-idp:AdminCreateUser',
    'cognito-idp:AdminDeleteUser',
    'cognito-idp:AdminSetUserSettings',
    'cognito-idp:ListUsers',
    'cognito-idp:AdminSetUserMFAPreference',
    'cognito-idp:AdminResetUserPassword',
    'cognito-idp:AdminGetUser',
    "appsync:EventConnect",
    "appsync:EventPublish",
    'events:PutEvents'
  ],
  resources: ['*'],
  effect: iam.Effect.ALLOW,
});

// Create AppSync Events API with custom Events construct
const eventsApi = new Events(backend.stack, 'BlogTRPCEvents', {
  userPool: backend.auth.resources.userPool,
  name: 'blog-trpc-events-api',
});

// Add environment variables to Lambda
backend.eventsHandler.addEnvironment('APPSYNC_API_ID', eventsApi.apiId);
backend.eventsHandler.addEnvironment('CHANNEL_NAMESPACE', 'default');
backend.eventsHandler.addEnvironment('EVENTS_ENDPOINT', eventsApi.endpoint);
if (databaseUrl) {
  backend.eventsHandler.addEnvironment('DATABASE_URL', databaseUrl);
}

// Add Lambda data source for tRPC handler
const dsEventsHandler = eventsApi.api.addLambdaDataSource(
  'DSEventsHandler',
  backend.eventsHandler.resources.lambda,
  {
    name: 'TRPCHandlerDataSource',
    description: 'Lambda handler for tRPC requests via AppSync Events',
  }
);

// Add channel namespace with Lambda handler for publish and subscribe
eventsApi.api.addChannelNamespace('trpc', {
  publishHandlerConfig: {
    dataSource: dsEventsHandler,
    direct: true,
    lambdaInvokeType: appsync.LambdaInvokeType.REQUEST_RESPONSE,
  },
  subscribeHandlerConfig: {
    dataSource: dsEventsHandler,
    direct: true,
    lambdaInvokeType: appsync.LambdaInvokeType.REQUEST_RESPONSE,
  },
});

// Add subscriptions namespace for query cache invalidation
// This channel doesn't need Lambda handlers - it's used for direct pub/sub
eventsApi.api.addChannelNamespace('subscriptions', {});

// Grant the Lambda function permissions to handle events
backend.eventsHandler.resources.lambda.addToRolePolicy(
  new PolicyStatement({
    actions: [
      'appsync:EventConnect',
      'appsync:EventSubscribe',
      'appsync:EventPublish',
      'ec2:CreateNetworkInterface',
      'ec2:DescribeNetworkInterfaces',
      'ec2:DeleteNetworkInterface',
    ],
    resources: [`${eventsApi.apiArn}/*`, `${eventsApi.apiArn}`],
  })
);

// Grant authenticated users permissions to use the Events API
backend.auth.resources.authenticatedUserIamRole.attachInlinePolicy(
  new Policy(backend.stack, 'AppSyncEventPolicy', {
    statements: [
      new PolicyStatement({
        actions: [
          'appsync:EventConnect',
          'appsync:EventSubscribe',
          'appsync:EventPublish',
        ],
        resources: [`${eventsApi.apiArn}/*`, `${eventsApi.apiArn}`],
      }),
    ],
  })
);

// Apply VPC configuration if provided
if (vpcConfig.SecurityGroupIds.length > 0 && vpcConfig.SubnetIds.length > 0) {
  backend.eventsHandler.resources.cfnResources.cfnFunction.addPropertyOverride(
    'VpcConfig',
    vpcConfig,
  );
}

/*
   Lambda VPC Overrides
*/

export const lambdaPGStatement3 = new iam.PolicyStatement({
  sid: 'AllowVPCLambda',
  actions: [
    'ec2:CreateNetworkInterface',
    'ec2:DescribeNetworkInterfaces',
    'ec2:DeleteNetworkInterface',
  ],
  resources: ['*'],
  effect: iam.Effect.ALLOW,
});


for (const resource of backend.eventsHandler.stack.node.findAll()) {
  if (cdk.CfnResource.isCfnResource(resource)) {
    //console.log(`Resource type: ${resource.cfnResourceType}`);
    if (resource.cfnResourceType === 'AWS::Lambda::Function') {
      console.log(
        `Override IAM and VPC Lambda function: ${resource.logicalId}`,
      );
      const lambdaFunction = resource as lambda.CfnFunction;
      const lambdaManagedPolicy = new iam.Policy(
        lambdaFunction.stack,
        `trpcLambdaManagedPolicy-${envName}`,
        {
          statements: [lambdaPGStatement3,lambdaPGStatement1],
        },
      );
      //lambdaFunction;
      if (vpcConfig.SecurityGroupIds.length > 0 && vpcConfig.SubnetIds.length > 0) {
        lambdaFunction.addPropertyOverride('VpcConfig', vpcConfig);
      }
      console.log(`Looking for arn: ${lambdaFunction.role}`);
      const role = iam.Role.fromRoleArn(
        lambdaFunction.stack,
        'Role',
        lambdaFunction.role,
        {
          // Set 'mutable' to 'false' to use the role as-is and prevent adding new
          // policies to it. The default is 'true', which means the role may be
          // modified as part of the deployment.
          mutable: true,
        },
      );
      // Create the execution role
      const executionRole = new iam.Role(
        lambdaFunction.stack,
        'ExecutionRole',
        {
          assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
        },
      );
      // Attach inline policies
      executionRole.attachInlinePolicy(lambdaManagedPolicy);
      // Assign the execution role to the Lambda function
      lambdaFunction.role = executionRole.roleArn;

      // Get the underlying CloudFormation resources
      const executionRoleResource = executionRole.node
        .defaultChild as iam.CfnRole;
      const inlinePolicyResource = lambdaManagedPolicy.node
        .defaultChild as iam.CfnPolicy;
    
      //lambdaFunction.addDependency(customLambdaLayers[2]);
      lambdaFunction.addDependency(executionRoleResource);
      lambdaFunction.addDependency(inlinePolicyResource);

      // Add the necessary managed policies
      executionRole.addManagedPolicy(
        iam.ManagedPolicy.fromAwsManagedPolicyName(
          'service-role/AWSLambdaVPCAccessExecutionRole',
        ),
      );

      role.attachInlinePolicy(lambdaManagedPolicy);
      lambdaFunction.node.addDependency(role);
    }
  }
}

// Export Events API configuration to amplify_outputs.json
backend.addOutput({
  custom: {
    events: {
      url: eventsApi.endpoint,
      aws_region: backend.stack.region,
      default_authorization_type: 'USER_POOL',
      api_id: eventsApi.apiId,
    },
  },
});
