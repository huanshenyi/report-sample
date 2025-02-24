export type Agent = {
  displayName: string;
  agentId: string;
  aliasId: string;
};

export type AgentInput = {
  actionGroup: string;
  apiPath: string;
  httpMethod: string;
  requestBody: {
    content: {
      "application/json": {
        properties: {
          name: string;
          type: string;
          value: string;
        }[];
      };
    };
  };
};

export type AgentOutput = {
  messageVersion: string;
  response: {
    actionGroup: string;
    apiPath: string;
    httpMethod: string;
    httpStatusCode: number;
    responseBody: {
      "application/json": {
        body: string;
      };
    };
  };
};

export interface SearchResult {
  [key: string]: any;
}

export type BraveSearchResult = {
  title: string;
  url: string;
  description: string;
  extra_snippets?: string[];
};

// 天気情報APIのレスポンス
export interface WeatherApiResponse {
  coord: {
    lon: number;
    lat: number;
  };
  weather: {
    id: number;
    main: string;
    description: string;
    icon: string;
  }[];
  base: string;
  main: {
    temp: number;
    feels_like: number;
    temp_min: number;
    temp_max: number;
    pressure: number;
    humidity: number;
    sea_level?: number;
    grnd_level?: number;
  };
  visibility: number;
  wind: {
    speed: number;
    deg: number;
    gust?: number;
  };
  clouds: {
    all: number;
  };
  dt: number;
  sys: {
    type: number;
    id: number;
    country: string;
    sunrise: number;
    sunset: number;
  };
  timezone: number;
  id: number;
  name: string;
  cod: number;
}

// トレンドデータの中身
// 元データの型定義（必要な部分のみ）
interface OriginalTrendItem {
  date: string;
  sales: number;
  num: number;
  price: number;
}
export interface OriginalData {
  title: string;
  trend: OriginalTrendItem[];
}

// 抽出後のデータ型
export interface ExtractedTrendItem {
  date: string;
  sales: number;
  num: number;
  price: number;
}

export interface ExtractedData {
  title: string;
  trend: ExtractedTrendItem[];
}

export interface ShopTrendData {
  platform_shop_code: string;
  shop_title: string;
  shop_url: string;
  trend: ShopTrendItem[];
  market: string;
}

export interface ShopTrendItem {
  date: string;
  sales: string;
  hot_item_num?: string;
  // biome-ignore lint/suspicious/noExplicitAny: <explanation>
  rakuten_event?: any[];
}
