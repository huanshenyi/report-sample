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
  const cookie =
    "_gcl_au=1.1.331740644.1734013188; _ga=GA1.1.923607719.1734013188; _fbp=fb.1.1734013187823.922463773599298269; _yjsu_yjad=1736163133.0ef40b0e-d1f3-4d6e-a280-65b956bd4996; _uetvid=8f98c0404f4611ef9516996faf3b5ca0|1lsp9cy|1736936905969|2|1|bat.bing.com/p/insights/c/o; _ga_JS6NHF3GDB=GS1.1.1736936902.4.1.1736937025.0.0.0; _clck=250bca%7C2%7Cft3%7C0%7C1807; _ga=GA1.3.923607719.1734013188; _gid=GA1.3.1327503981.1738456516; jp_chatplus_vtoken=ikoj0g7oqyf4mqoi3gf3ba017a8f; visitor_id978693=569737591; visitor_id978693-hash=049afe75135d05183e15fb8a623306c88c6b7c3a9aaebf9a334aa638f34ef63013b877918ba603d478fd4d475d3f2fe6dd6ad50c; PHPSESSID=48l3mjdocp54d6a46m59vshkf0; _gat_UA-54884083-14=1; _clsk=jtzybg%7C1738456649310%7C12%7C1%7Co.clarity.ms%2Fcollect; _ga_QPVNXETRF1=GS1.1.1738456482.11.1.1738456649.47.0.0";
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
