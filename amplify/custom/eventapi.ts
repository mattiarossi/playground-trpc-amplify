import { AppSyncAuthorizationType, AppSyncAuthProvider, AuthorizationType, CfnApi, CfnChannelNamespace, Code, EventApi } from "aws-cdk-lib/aws-appsync";
import { IUserPool } from "aws-cdk-lib/aws-cognito";
import { Construct } from "constructs";
import * as events from 'aws-cdk-lib/aws-events';



export interface EventsProps {
  userPool: IUserPool;
  name: string;
}

export class Events extends Construct {
  readonly endpoint: string;
  readonly apiId: string;
  readonly apiArn: string;
  readonly apiKey: string;
  readonly api: EventApi;

  constructor(scope: Construct, id: string, props: EventsProps) {
    super(scope, id);

    // https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-resource-appsync-api.html
    const iamProvider: AppSyncAuthProvider = {
      authorizationType: AppSyncAuthorizationType.IAM,
    };
    
    const apiKeyProvider: AppSyncAuthProvider = {
      authorizationType: AppSyncAuthorizationType.API_KEY,
    };

    const cognitoProvider: AppSyncAuthProvider = {
      authorizationType: AppSyncAuthorizationType.USER_POOL,
      cognitoConfig: {
        userPool: props.userPool,
      }

    };

    const api = new EventApi(this, 'api', {
      apiName: props.name,
      authorizationConfig: {
        // set auth providers
        authProviders: [
          iamProvider,
          apiKeyProvider,
          cognitoProvider
        ],
        connectionAuthModeTypes: [
          AppSyncAuthorizationType.IAM,
          AppSyncAuthorizationType.USER_POOL
        ],
        defaultPublishAuthModeTypes: [
          AppSyncAuthorizationType.IAM,
          AppSyncAuthorizationType.USER_POOL
        ],
        defaultSubscribeAuthModeTypes: [
          AppSyncAuthorizationType.IAM,
          AppSyncAuthorizationType.USER_POOL
        ],
      },
      
    });
    
    this.apiId = api.apiId;
    this.apiArn = api.apiArn;
    this.apiKey = (api.apiKeys && api.apiKeys['Default']) ? api.apiKeys['Default'].attrApiKey : ''
    this.api = api;
    this.endpoint = `https://${api.httpDns}/event`;
  }
}


// add a new Event API to the stack:
// const cfnEventAPI = new CfnApi(customResources, 'CfnEventAPI', {
//   name: 'my-event-api',
//   eventConfig: {
//     authProviders: [
//       {
//         authType: AuthorizationType.USER_POOL,
//         cognitoConfig: {
//           awsRegion: customResources.region,
//           // configure Event API to use the Cognito User Pool provisioned by Amplify:
//           userPoolId: backend.auth.resources.userPool.userPoolId,
//         },
//       },
//     ],
//     // configure the User Pool as the auth provider for Connect, Publish, and Subscribe operations:
//     connectionAuthModes: [{ authType: AuthorizationType.USER_POOL }],
//     defaultPublishAuthModes: [{ authType: AuthorizationType.USER_POOL }],
//     defaultSubscribeAuthModes: [{ authType: AuthorizationType.USER_POOL }],
//   },
// });


// // create a default namespace for our Event API:
// const namespace = new CfnChannelNamespace(
//   customResources,
//   'CfnEventAPINamespace',
//   {
//     apiId: cfnEventAPI.attrApiId,
//     name: 'default',
//   }
// );


// // attach a policy to the authenticated user role in our User Pool to grant access to the Event API:
// backend.auth.resources.authenticatedUserIamRole.attachInlinePolicy(
//   new Policy(customResources, 'AppSyncEventPolicy', {
//     statements: [
//       new PolicyStatement({
//         actions: [
//           'appsync:EventConnect',
//           'appsync:EventSubscribe',
//           'appsync:EventPublish',
//         ],
//         resources: [`${cfnEventAPI.attrApiArn}/*`, `${cfnEventAPI.attrApiArn}`],
//       }),
//     ],
//   })
// );


