import * as cdk from "aws-cdk-lib";
import type { StackProps } from "aws-cdk-lib";
import { Construct } from "constructs";
import type { Agent as AgentType } from "./construct/type";
import { SalesSurveyAgent } from "./construct/sales-survey-agent";
import { MakeReportAgent } from "./construct/make-report-agent";
import { HypervisorAgent } from "./construct/hypervisor-agent";
import { SearchWebAgent } from "./construct/search-web-agent";

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

    // webから情報取得
    const searchWebAgent = new SearchWebAgent(this, "SearchWebAgent", {
      envName: props.envName,
      projectName: props.projectName,
      knowledgeBaseId: props.ragKnowledgeBaseId,
    });

    // セールス情報を取得できるエージェント(今は店舗、今後色々対応予定)
    const salesSurveyAgent = new SalesSurveyAgent(this, "SalesSurveyAgent", {
      envName: props.envName,
      projectName: props.projectName,
      knowledgeBaseId: props.ragKnowledgeBaseId,
    });

    // 制作物を作るエージェント(今はパワポ、今後pdfなどを対応予定)
    const makeReportAgent = new MakeReportAgent(this, "MakeReportAgent", {
      envName: props.envName,
      projectName: props.projectName,
      knowledgeBaseId: props.ragKnowledgeBaseId,
    });

    /*
     * ハイパーバイザーエージェント
     * TODO: ちゃんとCDKで全部実装する
     */
    const hypervisorAgent = new HypervisorAgent(this, "HypervisorAgent", {
      envName: props.envName,
      projectName: props.projectName,
      knowledgeBaseId: props.ragKnowledgeBaseId,
    });

    this.agents = [
      ...salesSurveyAgent.agents,
      ...makeReportAgent.agents,
      ...hypervisorAgent.agents,
      ...searchWebAgent.agents,
    ];
  }
}
