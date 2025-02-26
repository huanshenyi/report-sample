import { BedrockAgentRuntime } from "@aws-sdk/client-bedrock-agent-runtime";
import {
  InvokeAgentRequest,
  InvokeAgentResponse,
  ResponseStream,
} from "@aws-sdk/client-bedrock-agent-runtime";

const bedrockAgentRuntime = new BedrockAgentRuntime({
  region: "ap-northeast-1",
});

// DeepResearchAgentとSearchWebAgentのIDを環境変数から取得
const DEEP_RESEARCH_AGENT_ID = process.env.DEEP_RESEARCH_AGENT_ID || "";
const DEEP_RESEARCH_AGENT_ALIAS_ID =
  process.env.DEEP_RESEARCH_AGENT_ALIAS_ID || "";
const SEARCH_WEB_AGENT_ID = process.env.SEARCH_WEB_AGENT_ID || "";
const SEARCH_WEB_AGENT_ALIAS_ID = process.env.SEARCH_WEB_AGENT_ALIAS_ID || "";

exports.handler = async (event: any) => {
  console.log("Event:", JSON.stringify(event, null, 2));

  try {
    const query = event.body?.query || "";
    const maxIterations = event.body?.max_iterations || 3;

    // ステップ1: DeepResearchAgentにクエリを送信してクエリセットを生成
    const querySetResult = await invokeDeepResearchAgent(query);
    const queries = JSON.parse(querySetResult).queries || [];

    console.log("Generated queries:", JSON.stringify(queries, null, 2));

    // ステップ2: 各クエリに対してSearchWebAgentを呼び出し
    const searchResults = [];
    for (const queryItem of queries) {
      const searchResult = await invokeSearchWebAgent(queryItem.query);
      searchResults.push({
        query: queryItem.query,
        researchGoal: queryItem.researchGoal,
        searchResult: searchResult,
      });
    }

    // ステップ3: 必要に応じて追加のクエリを生成（最大maxIterations回）
    // 実際の実装では、クロードの分析に基づいて追加のクエリが必要かどうかを判断するロジックが必要

    // 結果を整形して返す
    return {
      statusCode: 200,
      body: JSON.stringify({
        original_query: query,
        summary: `Deep research results for: ${query}`,
        research_details: searchResults,
        conclusion:
          "Based on the research conducted, here are the key findings...",
      }),
    };
  } catch (error) {
    console.error("Error:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: "An error occurred during the deep research process",
      }),
    };
  }
};

// DeepResearchAgentを呼び出す関数
async function invokeDeepResearchAgent(query: string): Promise<string> {
  const params: InvokeAgentRequest = {
    agentId: DEEP_RESEARCH_AGENT_ID,
    agentAliasId: DEEP_RESEARCH_AGENT_ALIAS_ID,
    sessionId: `deep-research-${Date.now()}`,
    inputText: query,
  };

  const response = await bedrockAgentRuntime.invokeAgent(params);
  return await extractResponseContent(response);
}

// SearchWebAgentを呼び出す関数
async function invokeSearchWebAgent(query: string): Promise<string> {
  const params: InvokeAgentRequest = {
    agentId: SEARCH_WEB_AGENT_ID,
    agentAliasId: SEARCH_WEB_AGENT_ALIAS_ID,
    sessionId: `search-web-${Date.now()}`,
    inputText: query,
  };

  const response = await bedrockAgentRuntime.invokeAgent(params);
  return await extractResponseContent(response);
}

// レスポンスコンテンツを抽出する関数
async function extractResponseContent(response: InvokeAgentResponse): Promise<string> {
  if (!response.completion) return '';
  
  let content = '';
  // AsyncIterableを処理
  for await (const item of response.completion) {
    // itemはResponseStream型
    const chunk = item as ResponseStream;
    
    // chunkプロパティがあればその値を取得
    if ('chunk' in chunk && chunk.chunk) {
      // TypeScriptの型チェックを明示的に行う
      if (chunk.chunk instanceof Uint8Array) {
        content += new TextDecoder().decode(chunk.chunk);
      } else if (typeof chunk.chunk === 'string') {
        content += chunk;
      }
    }
  }
  
  return content;
}

// トレース情報を抽出する関数（必要に応じて使用）
async function extractResponseTraces(response: InvokeAgentResponse): Promise<string[]> {
  if (!response.completion) return [];
  
  const traces: string[] = [];
  // AsyncIterable を反復処理
  for await (const item of response.completion) {
    // itemはResponseStream型
    const chunk = item as ResponseStream;
    
    // traceプロパティが存在する場合に処理
    if ('trace' in chunk && chunk.trace) {
      traces.push(JSON.stringify(chunk.trace));
    }
  }
  
  return traces;
}