import type * as cdk from "aws-cdk-lib";
import { Duration, RemovalPolicy } from "aws-cdk-lib";
import { CfnAgent, CfnAgentAlias } from "aws-cdk-lib/aws-bedrock";
import {
  Effect,
  PolicyDocument,
  PolicyStatement,
  Role,
  ServicePrincipal,
} from "aws-cdk-lib/aws-iam";
import { Runtime } from "aws-cdk-lib/aws-lambda";
import { NodejsFunction } from "aws-cdk-lib/aws-lambda-nodejs";
import {
  BlockPublicAccess,
  Bucket,
  BucketEncryption,
} from "aws-cdk-lib/aws-s3";
import { BucketDeployment, Source } from "aws-cdk-lib/aws-s3-deployment";
import { Construct } from "constructs";
import type { Agent as AgentType } from "./type";
// すでにあるknowledgeBaseをimport
// import { RagKnowledgeBase } from './rag-knowledge-base';

export interface AgentConstructProps extends cdk.StackProps {
  envName: "dev" | "stg" | "prd";
  projectName: string;
  knowledgeBaseId: string;
}

export class MakeReportAgent extends Construct {
  public readonly agents: AgentType[];

  constructor(scope: Construct, id: string, props: AgentConstructProps) {
    super(scope, id);

    // agents for bedrock の schema やデータを配置するバケット
    const s3Bucket = new Bucket(this, "MakeReportBucket", {
      encryption: BucketEncryption.S3_MANAGED,
      removalPolicy: RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
      enforceSSL: true,
      blockPublicAccess: BlockPublicAccess.BLOCK_ALL,
    });

    // schema を s3 に配置
    const schema = new BucketDeployment(this, "MakeReportApiSchemaBucket", {
      sources: [Source.asset("assets/api-schema")],
      destinationBucket: s3Bucket,
      destinationKeyPrefix: "api-schema",
    });

    // 成果物配置するs3
    const outputBucket = new Bucket(this, "OutputBucket", {
      encryption: BucketEncryption.S3_MANAGED,
      removalPolicy: RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
      enforceSSL: true,
      blockPublicAccess: BlockPublicAccess.BLOCK_ALL,
    });

    /*
     * Action Group Lambda
     */

    // トレンドデータ取得するAgentLambda
    const createPptxTool = new NodejsFunction(this, "CreatePptxTool", {
      runtime: Runtime.NODEJS_22_X,
      entry: "./lambda/create-pptx-tool.ts",
      timeout: Duration.seconds(300),
      memorySize: 512,
      environment: {
        ENV: props.envName,
        PROJECT_NAME: props.projectName,
        S3_BUCKET_NAME: outputBucket.bucketName,
      },
    });
    outputBucket.grantReadWrite(createPptxTool);

    createPptxTool.grantInvoke(new ServicePrincipal("bedrock.amazonaws.com"));

    // Agent
    const bedrockAgentRole = new Role(this, "MakeReportBedrockAgentRole", {
      roleName: "AmazonBedrockExecutionRoleForAgents_CreateEngine",
      assumedBy: new ServicePrincipal("bedrock.amazonaws.com"),
      inlinePolicies: {
        BedrockAgentS3BucketPolicy: new PolicyDocument({
          statements: [
            new PolicyStatement({
              effect: Effect.ALLOW,
              resources: [s3Bucket.bucketArn, `${s3Bucket.bucketArn}/*`],
              actions: ["*"],
            }),
          ],
        }),
        BedrockAgentBedrockModelPolicy: new PolicyDocument({
          statements: [
            new PolicyStatement({
              effect: Effect.ALLOW,
              resources: ["*"],
              actions: ["bedrock:*"],
            }),
          ],
        }),
      },
    });

    const makeReportAgent = new CfnAgent(this, "MakeReportAgent", {
      agentName: "MakeReportAgent",
      knowledgeBases: [], // TODO: いい感じに実装する
      actionGroups: [
        {
          actionGroupName: "createPptxTool",
          actionGroupExecutor: {
            lambda: createPptxTool.functionArn,
          },
          apiSchema: {
            s3: {
              s3BucketName: schema.deployedBucket.bucketName,
              s3ObjectKey: "api-schema/create-pptx.json",
            },
          },
          description: "Create pptx",
        },
      ],
      agentResourceRoleArn: bedrockAgentRole.roleArn,
      idleSessionTtlInSeconds: 3600,
      autoPrepare: true,
      description:
        "与えられたトピックについて、ツール使ってで日本語の解説資料を作成します",
      foundationModel: "anthropic.claude-3-5-sonnet-20240620-v1:0",
      instruction: `あなたはレポート作成の専門家。以下の厳密な指示に従って対応します:
【対応方法】
1. ppt、パワポ、レポートの作成依頼された際に:
   - createPptxToolを使用
   - 必須パラメータを以下の形式で含める:
     * topic: [説明: スライドのメイントピック]
     * content: [説明: スライドに含める内容	(形式: スライド1のタイトル
スライド1の内容

スライド2のタイトル
スライド2の内容

スライド3のタイトル
スライド3の内容)]

DO NOT TALK JUST GENERATE ANSWER
      `,
    });
    const makeReportAgentAlias = new CfnAgentAlias(
      this,
      "MakeReportAgentAlias",
      {
        agentId: makeReportAgent.attrAgentId,
        agentAliasName: "v1", // agent 修正された場合は都度更新 + 1
      }
    );

    this.agents = [
      {
        displayName: "CreateEngine",
        agentId: makeReportAgent.attrAgentId,
        aliasId: makeReportAgentAlias.attrAgentAliasId,
      },
    ];
  }
}
