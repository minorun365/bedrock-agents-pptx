import { defineBackend } from '@aws-amplify/backend';
import { auth } from './auth/resource';
import { PolicyStatement, Effect } from 'aws-cdk-lib/aws-iam';

const backend = defineBackend({ auth });

// 認証済みユーザーにBedrock Agentsの呼び出し権限を追加
backend.auth.resources.authenticatedUserIamRole.addToPrincipalPolicy(
  new PolicyStatement({
    effect: Effect.ALLOW,
    actions: ['bedrock:InvokeAgent'],
    resources: ['arn:aws:bedrock:us-east-1:*:agent-alias/*/*'],
  })
);
