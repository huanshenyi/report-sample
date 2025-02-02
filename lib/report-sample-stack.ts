import * as cdk from "aws-cdk-lib";
import type { StackProps } from "aws-cdk-lib";
import { Construct } from "constructs";
import type { Agent as AgentType } from "./construct/type";
import { SalesSurveyAgent } from "./construct/sales-survey-agent";

interface AgentStackProps extends StackProps {
  envName: "dev" | "stg" | "prd";
  env: {
    account?: string;
    region?: string;
  };
  projectName: string;
  ragKnowledgeBaseId: string;
}

export class ReportSampleStack extends cdk.Stack {
  public readonly agents: AgentType[];

  constructor(scope: Construct, id: string, props: AgentStackProps) {
    super(scope, id, props);

    // セールス情報取得できるエージェント(今は店舗、今後色々対応予定)
    const salesSurveyAgent = new SalesSurveyAgent(this, "SalesSurveyAgent", {
      envName: props.envName,
      projectName: props.projectName,
      knowledgeBaseId: props.ragKnowledgeBaseId,
    });
    this.agents = salesSurveyAgent.agents;
  }
}
