import type * as cdk from "aws-cdk-lib";
import { RemovalPolicy } from "aws-cdk-lib";
import { CfnAgent, CfnAgentAlias } from "aws-cdk-lib/aws-bedrock";
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

export interface AgentConstructProps extends cdk.StackProps {
  envName: "dev" | "stg" | "prd";
  projectName: string;
  knowledgeBaseId: string;
}

export class DeepResearchAgent extends Construct {
  public readonly agents: AgentType[];

  constructor(scope: Construct, id: string, props: AgentConstructProps) {
    super(scope, id);

    // agents for bedrock の schema やデータを配置するバケット
    const s3Bucket = new Bucket(this, "DeepResearchBucket", {
      encryption: BucketEncryption.S3_MANAGED,
      removalPolicy: RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
      enforceSSL: true,
      blockPublicAccess: BlockPublicAccess.BLOCK_ALL,
    });

    // schema を s3 に配置
    const schema = new BucketDeployment(this, "DeepResearchApiSchemaBucket", {
      sources: [Source.asset("assets/api-schema")],
      destinationBucket: s3Bucket,
      destinationKeyPrefix: "api-schema",
    });

    /*
     * Action Group Lambda
     */

    // Agent
    const bedrockAgentRole = new Role(this, "DeepResearchBedrockAgentRole", {
      roleName: "AmazonBedrockExecutionRoleForDeepResearchAgents_CreateEngine",
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

    const deepResearchAgent = new CfnAgent(this, "DeepResearchAgent", {
      agentName: "DeepResearchAgent",
      knowledgeBases: [], // TODO: いい感じに実装する
      actionGroups: [],
      agentResourceRoleArn: bedrockAgentRole.roleArn,
      idleSessionTtlInSeconds: 3600,
      autoPrepare: true,
      description: "調査シナリオを作るエージェント",
      foundationModel: "anthropic.claude-3-5-sonnet-20240620-v1:0",
      instruction: `あなたは研究アナリストのエキスパートです。以下の手順に正確に従ってください：:
[STEP1: フォローアップ質問の生成]
ユーザーの入力クエリに基づいて、研究の方向性を明確にするための3つの戦略的なフォローアップ質問を生成してください
質問は以下の点に焦点を当ててください：
- 範囲と期間
- 地理的または人口統計学的な焦点
- 特定の側面や変数

[STEP2: 回答の提供]
各フォローアップ質問に対して詳細な回答を提供し、以下を確保してください：
- 明確性と具体性
- 現実的な制約
- 実行可能なパラメータ

[STEP3: 初期クエリのフォーマット]
以下の形式でクエリをフォーマットしてください：

Initial Query: {ユーザーの元のクエリ}
Follow-up Questions and Answers:
Q: {質問1} A: {回答1}
Q: {質問2} A: {回答2}
Q: {質問3} A: {回答3}

[STEP4: SERP クエリの生成]
STEP3でフォーマットされたクエリに基づいて:
- 最大3つのユニークなSERPクエリを生成
- 各クエリが異なる側面を対象としていることを確認
- 重複や冗長なクエリを避ける
- Q&Aで特定されたパラメータを含める
- 過去の調査結果が提供された場合は、そこから明らかになった新たな疑問点に基づいてクエリを生成

[STEP5: 出力フォーマット]
結果を以下の正確な構造で返してください：
{
  queries: [
    {
      query: "SERP検索クエリ",
      researchGoal: "具体的な研究目的と調査の次のステップ"
    },
    ...
  ],
}

実行制約：
- 出力のみを提供し、説明は不要
- 正確なJSON形式で返す
- すべてのクエリが一意で具体的であることを確認
- 実行可能な研究目標を含める`,
    });
    const deepResearchAgentAlias = new CfnAgentAlias(
      this,
      "MakeReportAgentAlias",
      {
        agentId: deepResearchAgent.attrAgentId,
        agentAliasName: "v1", // agent 修正された場合は都度更新 + 1
      }
    );

    this.agents = [
      {
        displayName: "deepResearchEngine",
        agentId: deepResearchAgent.attrAgentId,
        aliasId: deepResearchAgentAlias.attrAgentAliasId,
      },
    ];
  }
}
