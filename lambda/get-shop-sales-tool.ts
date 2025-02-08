import {
  GetSecretValueCommand,
  SecretsManagerClient,
} from "@aws-sdk/client-secrets-manager";
import type { AgentInput, AgentOutput } from "../lib/construct/type";
// import { superLongPublicKeyEncrypt } from './utils/crypto';
// import { fixCidPath, fixMarket } from "./utils/format";

export const handler = async (event: AgentInput): Promise<AgentOutput> => {
  // Parameters
  const props = event.requestBody.content["application/json"].properties;
  console.log("props:", props);
  try {
    let dateEnd = ""; // 2025-01-31 or 2025-01
    let dateStart = ""; // 2025-01-31 or 2025-01
    let dateType = ""; // day or month
    let platformShopCodes: string[] = [];
    let market = ""; // yahoo
    let requestPage = "trend"; // trend

    for (const prop of props) {
      if (prop.name === "data" && prop.type === "object" && prop.value) {
        const valueStr = prop.value;

        const dateEndMatch = valueStr.match(/date_end=([\d-]+)/);
        const dateStartMatch = valueStr.match(/date_start=([\d-]+)/);
        const dateTypeMatch = valueStr.match(/date_type=(\w+)/);
        const marketMatch = valueStr.match(/market=(\w+)/);
        const platformShopCodesMatch = valueStr.match(
          /platform_shop_codes=\[(.*?)\]/
        );
        const requestPageMatch = valueStr.match(/request_page=(\w+)/);

        // 値を設定
        platformShopCodes = platformShopCodesMatch
          ? platformShopCodesMatch[1].split(",").filter(Boolean)
          : [];
        dateStart = dateStartMatch ? dateStartMatch[1] : "";
        dateEnd = dateEndMatch ? dateEndMatch[1] : "";
        dateType = dateTypeMatch ? dateTypeMatch[1] : "";
        market = marketMatch ? marketMatch[1] : "";
        // requestPage = requestPageMatch ? requestPageMatch[1] : "trend";
      }
    }

    // Get scale data
    const scaleData = await getShopTrendSalesData(
      dateEnd,
      dateStart,
      dateType,
      market,
      platformShopCodes,
      requestPage
    );

    // Extract and format response
    const filteredData = scaleData?.data || {};
    const dates = filteredData.dates || [];
    const list = filteredData.list || [];

    // Tokenの兼ね合いで上位10まで返す
    const limitedList = list.slice(0, 10);

    const result = {
      dates,
      limitedList,
    };

    // Create Response Object
    const responseBody = {
      "application/json": {
        body: `<scale_data>${JSON.stringify(result)}</scale_data>`,
      },
    };
    const actionResponse = {
      actionGroup: event.actionGroup,
      apiPath: event.apiPath,
      httpMethod: event.httpMethod,
      httpStatusCode: 200,
      responseBody,
    };
    const apiResponse = {
      messageVersion: "1.0",
      response: actionResponse,
    };

    return apiResponse;
  } catch (error: unknown) {
    console.error(error);
    const actionResponse = {
      actionGroup: event.actionGroup,
      apiPath: event.apiPath,
      httpMethod: event.httpMethod,
      httpStatusCode: 500,
      responseBody: {
        "application/json": {
          body: "Internal Server Error",
        },
      },
    };
    const apiResponse = {
      messageVersion: "1.0",
      response: actionResponse,
    };
    return apiResponse;
  }
};

const getCookie = async (): Promise<string> => {
  const env = process.env.ENV || "dev";
  const projectName = process.env.PROJECT_NAME || "chat-commerce";
  const secretName = `${env}/${projectName}/secret`;
  const regionName = "ap-northeast-1";

  const client = new SecretsManagerClient({ region: regionName });
  try {
    const command = new GetSecretValueCommand({ SecretId: secretName });
    const response = await client.send(command);

    if (response.SecretString) {
      const secret = JSON.parse(response.SecretString);
      return secret.COOKIE_KEY;
    }
    throw new Error("SecretString is undefined");
  } catch (error) {
    throw new Error("Failed to retrieve weather api key: ?");
  }
};

const getShopTrendSalesData = async (
  dateEnd: string,
  dateStart: string,
  dateType: string,
  market: string,
  platformShopCodes: string[],
  requestPage: string
  // biome-ignore lint/suspicious/noExplicitAny: <explanation>
): Promise<any> => {
  // const cookie = await getCookie();
  const cookie = "";
  const url = "https://ec-test5.nint.jp/api/shop/get-shop-trend-sales";
  const payload = {
    data: {
      date_end: dateEnd,
      date_start: dateStart,
      date_type: dateType,
      market: market,
      platform_shop_codes: platformShopCodes,
      request_page: requestPage,
    },
  };

  console.log("payload:", payload);

  const headers = {
    Cookie: cookie,
    "Content-Type": "application/json",
  };

  //   const useEncrypt = true;
  //   const encryptedBody = superLongPublicKeyEncrypt(payload, useEncrypt);

  try {
    const response = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.log(error);
    return { data: {} };
  }
};
