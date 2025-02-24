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

export class SalesSurveyAgent extends Construct {
  public readonly agents: AgentType[];

  constructor(scope: Construct, id: string, props: AgentConstructProps) {
    super(scope, id);

    // agents for bedrock の schema やデータを配置するバケット
    const s3Bucket = new Bucket(this, "Bucket", {
      encryption: BucketEncryption.S3_MANAGED,
      removalPolicy: RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
      enforceSSL: true,
      blockPublicAccess: BlockPublicAccess.BLOCK_ALL,
    });

    // schema を s3 に配置
    const schema = new BucketDeployment(this, "SalesSurveyApiSchemaBucket", {
      sources: [Source.asset("assets/api-schema")],
      destinationBucket: s3Bucket,
      destinationKeyPrefix: "api-schema",
    });

    /*
     * Action Group Lambda
     */

    // トレンドデータ取得するAgentLambda
    const getShopSalesTool = new NodejsFunction(this, "GetShopSalesTool", {
      runtime: Runtime.NODEJS_22_X,
      entry: "./lambda/get-shop-sales-tool.ts",
      timeout: Duration.seconds(300),
      memorySize: 512,
      environment: {
        ENV: props.envName,
        PROJECT_NAME: props.projectName,
      },
    });
    getShopSalesTool.grantInvoke(new ServicePrincipal("bedrock.amazonaws.com"));

    // Agent
    const bedrockAgentRole = new Role(this, "BedrockAgentRole", {
      roleName: "AmazonBedrockExecutionRoleForAgents_SearchEngine",
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

    const salesSurveyAgent = new CfnAgent(this, "SalesSurveyAgent", {
      agentName: "SalesSurveyAgent",
      knowledgeBases: [], // TODO: いい感じに実装する
      actionGroups: [
        {
          actionGroupName: "getShopSalesTool",
          actionGroupExecutor: {
            lambda: getShopSalesTool.functionArn,
          },
          apiSchema: {
            s3: {
              s3BucketName: schema.deployedBucket.bucketName,
              s3ObjectKey: "api-schema/get-shop-sales.json",
            },
          },
          description: "Get Shop Sales Data",
        },
      ],
      agentResourceRoleArn: bedrockAgentRole.roleArn,
      idleSessionTtlInSeconds: 3600,
      autoPrepare: true,
      description: "sales survey agent",
      foundationModel: "anthropic.claude-3-5-sonnet-20240620-v1:0",
      instruction: `あなたはデータアナリスト兼BIスペシャリストです。以下の厳密な指示に従って対応します:
【質問種別と対応方法】
1. ショップの売り上げ確認:
   - getShopSalesToolを使用
   - 必須パラメータを以下の形式で含める:
     * date_end: [説明: データ抽出の終了日 (形式: YYYY-MM)]
     * date_start: [説明: データ抽出の開始日 (形式: YYYY-MM)]
     * market: [説明: データを分析する対象市場。許容値はrakuten, yahoo, amazon。デフォルト値はrakuten。ユーザーの入力値が楽天の場合、rakutenとします。]
     * date_type: [説明: データ抽出のタイプ。許容値はday, month。デフォルト値はday。ユーザーの入力値がmonthの場合、monthとします。]
     * platform_shop_codes: [説明: 対象ショップのcodesが入るリスト、必ず複数の中身が必要なわけではない。]
   - 入力内容からmarket情報を認識。指定がない場合はデフォルト値'rakuten'を使用し、その旨を回答に明記。
【追加ルール】
- 比較系のタスクに対して、ツールの利用複数利用は可能です、
  例:
     * 今週の売り上げと先週の売上げ比較
DO NOT TALK JUST GENERATE ANSWER
      `,
    });
    const salesSurveyAgentAlias = new CfnAgentAlias(
      this,
      "SalesSurveyAgentAlias",
      {
        agentId: salesSurveyAgent.attrAgentId,
        agentAliasName: "v1", // agent 修正された場合は都度更新 + 1
      }
    );

    this.agents = [
      {
        displayName: "SearchEngine",
        agentId: salesSurveyAgent.attrAgentId,
        aliasId: salesSurveyAgentAlias.attrAgentAliasId,
      },
    ];
  }
}
