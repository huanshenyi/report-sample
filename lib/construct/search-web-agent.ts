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

export class SearchWebAgent extends Construct {
  public readonly agents: AgentType[];

  constructor(scope: Construct, id: string, props: AgentConstructProps) {
    super(scope, id);

    // agents for bedrock の schema やデータを配置するバケット
    const s3Bucket = new Bucket(this, "SearchWebBucket", {
      encryption: BucketEncryption.S3_MANAGED,
      removalPolicy: RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
      enforceSSL: true,
      blockPublicAccess: BlockPublicAccess.BLOCK_ALL,
    });

    // schema を s3 に配置
    const schema = new BucketDeployment(this, "SearchWebApiSchemaBucket", {
      sources: [Source.asset("assets/api-schema")],
      destinationBucket: s3Bucket,
      destinationKeyPrefix: "api-schema",
    });

    /*
     * Action Group Lambda
     */

    // tavily
    const searchTavilyTool = new NodejsFunction(this, "SearchTavilyTool", {
      runtime: Runtime.NODEJS_22_X,
      entry: "./lambda/search-tavily-tool.ts",
      timeout: Duration.seconds(500),
      memorySize: 512,
      environment: {
        ENV: props.envName,
        PROJECT_NAME: props.projectName,
        TAVILY_API_KEY: "",
      },
    });
    searchTavilyTool.grantInvoke(new ServicePrincipal("bedrock.amazonaws.com"));

    //firecrawl
    const searchFirecrawlTool = new NodejsFunction(
      this,
      "SearchFirecrawlTool",
      {
        runtime: Runtime.NODEJS_22_X,
        entry: "./lambda/search-firecrawl-tool.ts",
        timeout: Duration.seconds(500),
        memorySize: 512,
        environment: {
          ENV: props.envName,
          PROJECT_NAME: props.projectName,
          FC_API_KEY: "",
        },
      }
    );
    searchFirecrawlTool.grantInvoke(
      new ServicePrincipal("bedrock.amazonaws.com")
    );

    // Agent
    const bedrockAgentRole = new Role(this, "SearchWebAgentRole", {
      roleName: "AmazonBedrockExecutionRoleForAgents_SearchWebEngine",
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

    const searchWebAgent = new CfnAgent(this, "SearchWebAgent", {
      agentName: "searchWebAgent",
      knowledgeBases: [], // TODO: いい感じに実装する
      actionGroups: [
        {
          actionGroupName: "searchTavilyTool",
          actionGroupExecutor: {
            lambda: searchTavilyTool.functionArn,
          },
          apiSchema: {
            s3: {
              s3BucketName: schema.deployedBucket.bucketName,
              s3ObjectKey: "api-schema/search-tavily.json",
            },
          },
          description: "use tavily get web data",
        },
        {
          actionGroupName: "searchFirecrawlTool",
          actionGroupExecutor: {
            lambda: searchFirecrawlTool.functionArn,
          },
          apiSchema: {
            s3: {
              s3BucketName: schema.deployedBucket.bucketName,
              s3ObjectKey: "api-schema/search-firecrawl.json",
            },
          },
          description: "use firecrawl get web data",
        },
      ],
      agentResourceRoleArn: bedrockAgentRole.roleArn,
      idleSessionTtlInSeconds: 3600,
      autoPrepare: true,
      description: "search web agent",
      foundationModel: "anthropic.claude-3-5-sonnet-20240620-v1:0",
      instruction: `あなたはWeb調査エージェントです。以下の厳密な指示に従って対応します:
- 非常に体系的に整理してください。
- ユーザーが思いつかなかった解決策を提案してください。
- 積極的に先回りし、ユーザーのニーズを予測してください。
- あらゆる分野の専門家としてユーザーを扱ってください。
- 詳細な説明を提供してください。多くの詳細情報があっても問題ありません。
- 権威よりも優れた議論を重視し、情報源は関係ありません。
- 従来の常識だけでなく、新しい技術や一般的な見方に反する意見も検討してください。
- 高度な推測や予測を行うことができますが、その場合はその旨を明確に示してください。
【ツールの使用方法】
ユーザー入力をSERPクエリ変換してqueryとして利用する
1. TavilyTool:
   * query: [説明: 検索したいキーワードまたはフレーズ.]
2. FirecrawlTool
   * query: [説明: 検索したいキーワードまたはフレーズ.]
DO NOT TALK JUST GENERATE ANSWER
      `,
    });
    const searchWebAgentAlias = new CfnAgentAlias(this, "SearchWebAgentAlias", {
      agentId: searchWebAgent.attrAgentId,
      agentAliasName: "v1", // agent 修正された場合は都度更新 + 1
    });

    this.agents = [
      {
        displayName: "SearchWebEngine",
        agentId: searchWebAgent.attrAgentId,
        aliasId: searchWebAgentAlias.attrAgentAliasId,
      },
    ];
  }
}
