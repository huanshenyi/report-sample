import { TavilyClient } from "tavily";

import type { AgentInput, AgentOutput, SearchResult } from "../lib/construct/type";

export const handler = async (
  event: AgentInput,
  context: any
): Promise<AgentOutput> => {
  // Get API key from environment variables
  const tavilyApiKey = process.env.TAVILY_API_KEY;

  if (!tavilyApiKey) {
    throw new Error("TAVILY_API_KEY environment variable is not set");
  }

  // Extract query parameter from event
  const props = event.requestBody.content["application/json"].properties;

  let query = "";
  for (const prop of props) {
    if (prop.name === "query") {
      query = prop.value;
      break;
    }
  }

  if (!query) {
    throw new Error("Query parameter is required");
  }

  // Initialize Tavily client and execute search
  const client = new TavilyClient({ apiKey: tavilyApiKey });
  const searchResult: SearchResult = await client.search({
    query,
    max_results: 5,
    search_depth: "advanced" // 深く
  });

  // Return success response
  const responseBody = {
    "application/json": {
      body: `<tavily_data>${JSON.stringify(searchResult)}</tavily_data>`,
    },
  };
  return {
    messageVersion: "1.0",
    response: {
      actionGroup: event.actionGroup,
      apiPath: event.apiPath,
      httpMethod: event.httpMethod,
      httpStatusCode: 200,
      responseBody,
    },
  };
};
