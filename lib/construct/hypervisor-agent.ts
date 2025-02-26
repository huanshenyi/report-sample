import type * as cdk from "aws-cdk-lib";
import { Duration, RemovalPolicy } from "aws-cdk-lib";
import { CfnAgent, CfnAgentAlias } from "aws-cdk-lib/aws-bedrock";
import { Runtime } from "aws-cdk-lib/aws-lambda";
import {
  Effect,
  PolicyDocument,
  PolicyStatement,
  Role,
  ServicePrincipal,
} from "aws-cdk-lib/aws-iam";
import {
  BlockPublicAccess,
  Bucket,
  BucketEncryption,
} from "aws-cdk-lib/aws-s3";
import { BucketDeployment, Source } from "aws-cdk-lib/aws-s3-deployment";
import { Construct } from "constructs";
import type { Agent as AgentType } from "./type";
import { NodejsFunction } from "aws-cdk-lib/aws-lambda-nodejs";
// すでにあるknowledgeBaseをimport
// import { RagKnowledgeBase } from './rag-knowledge-base';

export interface AgentConstructProps extends cdk.StackProps {
  envName: "dev" | "stg" | "prd";
  projectName: string;
  knowledgeBaseId: string;
}

export class HypervisorAgent extends Construct {
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

    /*
     * Action Group Lambda
     */
    const deepResearchOrchestrationTool = new NodejsFunction(
      this,
      "DeepResearchOrchestrationTool",
      {
        runtime: Runtime.NODEJS_22_X,
        entry: "./lambda/deep-research-orchestration-tool.ts", // Implement this file with the logic above
        timeout: Duration.seconds(600), // Longer timeout for recursive process
        memorySize: 1024,
        environment: {
          ENV: props.envName,
          PROJECT_NAME: props.projectName,
          DEEP_RESEARCH_AGENT_ID: "deepResearchAgentId",
          DEEP_RESEARCH_AGENT_ALIAS_ID: "deepResearchAgentAliasId",
          SEARCH_WEB_AGENT_ID: "searchWebAgentId",
          SEARCH_WEB_AGENT_ALIAS_ID: "searchWebAgentAliasId",
        },
      }
    );
    deepResearchOrchestrationTool.addToRolePolicy(
      new PolicyStatement({
        effect: Effect.ALLOW,
        actions: ["bedrock:InvokeAgent"],
        resources: ["*"], // Consider restricting to specific agent ARNs
      })
    );

    // Agent
    const bedrockAgentRole = new Role(this, "MakeReportBedrockAgentRole", {
      roleName: "AmazonBedrockExecutionRoleForAgents_HypervisorEngine",
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

    const hypervisorAgent = new CfnAgent(this, "HypervisorAgent", {
      agentName: "HypervisorAgent",
      knowledgeBases: [], // TODO: いい感じに実装する
      actionGroups: [
        {
          actionGroupName: "UserInput",
          parentActionGroupSignature: "AMAZON.UserInput",
        },
        {
          actionGroupName: "deepResearchOrchestration",
          actionGroupExecutor: {
            lambda: deepResearchOrchestrationTool.functionArn,
          },
          apiSchema: {
            s3: {
              s3BucketName: schema.deployedBucket.bucketName,
              s3ObjectKey: "api-schema/deep-research-orchestration.json", // Create this schema
            },
          },
          description:
            "Orchestrate deep research by coordinating DeepResearchAgent and SearchWebAgent",
        },
      ],
      agentResourceRoleArn: bedrockAgentRole.roleArn,
      idleSessionTtlInSeconds: 3600,
      autoPrepare: true,
      description: "与えられたトピックについて、ツール使って解決しましょう",
      foundationModel: "anthropic.claude-3-5-sonnet-20240620-v1:0",
      instruction: `あなたはAIAgent活用の専門家として、複数のAIAgentを連携させ、ユーザーのリクエストに最適なレポートを提供します。
## 基本動作の流れ
1. ユーザーの入力を解析し、必要なデータと要件を特定
2. 適切なAIAgentを選択し、必要なパラメータを設定
3. 結果をユーザーに提供

### レポート作成の要望に対して、MakeReportAgent使って最後にレポート作る
### Deep Researchの要望に対して、DeepResearchOrchestrationToolを使用してリサーチを実行

## 利用可能なAIAgents

名前: SalesSurveyAgent
- 店舗、ショップのセールス情報を取得できます。
   - 必須パラメータを以下の形式で含める:
     * date_end: [説明: データ抽出の終了日 (形式: YYYY-MM or YYYY-MM-DD)]
     * date_start: [説明: データ抽出の開始日 (形式: YYYY-MM or YYYY-MM-DD)]
     * market: [説明: データを分析する対象市場。許容値はrakuten, yahoo, amazon。デフォルト値はrakuten。ユーザーの入力値が楽天の場合、rakutenとします。]
     * date_type: [説明: データ抽出のタイプ。許容値はday, month。デフォルト値はday。dayの場合、date_endとdate_startはYYYY-MM-DD形式になる]
     * platform_shop_codes: [説明: 対象ショップのcodesが入るリスト、必ず複数の中身が必要なわけではない。]

名前: MakeReportAgent
- レポート作れるAIAgentです、ダウロードリンクも提供してくれます。
   - 必須パラメータを以下の形式で含める:
     * topic: [説明: スライドのメイントピック]
     * agenda: [説明: スライド1, 2, 3などのタイトルの集合体(形式:スライド1のタイトル,スライド2のタイトル,スライド3のタイトル)]
     * content: [説明: スライドに含める内容	(形式: スライド1のタイトルスライド1の内容

スライド2のタイトル
スライド2の内容

スライド3のタイトル
スライド3の内容)]
    * backgroundColor: [説明: スライドのbackgroundカラーコード, F0FFFF, fffaf0, ffffffなど、適当に淡い色を使う]

名前: DeepResearchOrchestrationTool
- 複雑なリサーチプロセスを自動化するツールです。DeepResearchAgentとSearchWebAgentを内部で連携させ、包括的な調査結果を提供します。
   - 必須パラメータを以下の形式で含める:
     * query: [説明: 調査したいトピックやリサーチクエリ]
     * max_iterations: [説明: 最大調査ループ回数（デフォルト: 3）。オプション]

名前: SearchWebAgent
- ウェブ検索用ツール管理エージェント、必要な回数に応じて複数回呼び出せる
   - 必須パラメータを以下の形式で含める:
     * query: [説明: 検索したいキーワードまたはフレーズ.]

使用サンプル: 
ユーザー入力: 今日は2025年2月08日、Yahooの2#:@hikaritvショップの先週と先々週の売り上げ比較するレポート欲しい。
実行方法: まず、SalesSurveyAgent使って、2月3日から7のデータと、1月27、31までの取得、それからMakeReportAgentにデータを渡して、レポート作ってもらう

ユーザー入力: これからの日本米の値段変化知りたい、DeepResearch使用する。
実行方法: 
   - DeepResearchOrchestrationToolを使用して、クエリ「これからの日本米の値段変化」を実行します。
   - ツールは内部でDeepResearchAgentとSearchWebAgentを適切に連携させ、検索結果と分析を提供します。
   - 検索結果と最終判断をユーザーに返します。

DO NOT TALK JUST GENERATE ANSWER
      `,
    });
    const hypervisorAgentAlias = new CfnAgentAlias(
      this,
      "HypervisorAgentAlias",
      {
        agentId: hypervisorAgent.attrAgentId,
        agentAliasName: "v1", // agent 修正された場合は都度更新 + 1
      }
    );

    this.agents = [
      {
        displayName: "CreateEngine",
        agentId: hypervisorAgent.attrAgentId,
        aliasId: hypervisorAgentAlias.attrAgentAliasId,
      },
    ];
  }
}
