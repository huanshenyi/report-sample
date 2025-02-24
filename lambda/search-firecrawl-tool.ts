import FirecrawlApp from "@mendable/firecrawl-js";
import { AgentInput, AgentOutput, SearchResult } from "../lib/construct/type";

export const handler = async (
  event: AgentInput,
  context: any
): Promise<AgentOutput> => {
  const firecrawlApiKey = process.env.FC_API_KEY;

  if (!firecrawlApiKey) {
    throw new Error("FC_API_KEY environment variable is not set");
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
  const app = new FirecrawlApp({ apiKey: firecrawlApiKey });
  const response: SearchResult = await app.search(query, {
    timeout: 15000,
    limit: 3,
    scrapeOptions: { formats: ["markdown"] },
  });

  if (!response.success) {
    throw new Error(`Failed to crawl: ${response.error}`);
  }

  const filteredResponse = {
    data: response.data.map(
      ({
        title,
        description,
        url,
        metadata,
      }: {
        title: string;
        description: string;
        url: string;
        metadata: Object;
      }) => ({
        title,
        description,
        url,
        metadata,
      })
    ),
  };

  console.log(filteredResponse);
  // Return success response
  const responseBody = {
    "application/json": {
      body: `<firecrawl_data>${JSON.stringify(
        filteredResponse
      )}</firecrawl_data>`,
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
