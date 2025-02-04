import { S3 } from "aws-sdk";
import PptxGenJS from "pptxgenjs";
import { AgentInput, AgentOutput } from "../lib/construct/type";

const S3_BUCKET_NAME = process.env.S3_BUCKET_NAME;

export const handler = async (event: AgentInput): Promise<AgentOutput> => {
  const props = event.requestBody.content["application/json"].properties;
  try {
    let topic = "";
    let content = "";
    for (const prop of props) {
      if (prop.name === "topic") {
        topic = prop.value;
      } else if (prop.name === "content") {
        content = prop.value.trim();
      }
    }

    const slidesContent = content.split("\n\n");

    // プレゼンテーション作成
    const pptx = new PptxGenJS();

    // タイトルスライド
    let slide = pptx.addSlide();
    slide.background = { color: "F0F0F0" };
    slide.addText(topic, {
      x: 0,
      y: "40%", // スライドの40%の高さに配置
      w: "100%", // 幅いっぱいにして中央揃え
      fontSize: 32,
      bold: true,
      align: "center", // 中央揃え
    });
    slide.addText(`作成日: ${new Date().toLocaleDateString("ja-JP")}`, {
      x: 0,
      y: "55%", // タイトルより少し下
      w: "100%",
      fontSize: 16,
      align: "center",
    });

    // コンテンツスライド
    slidesContent.forEach((slideContent) => {
      const lines = slideContent.split("\n");
      const titleText = lines[0].replace(/^[-\s]+/, "");
      const bodyText = lines
        .slice(1)
        .map((line) => line.replace(/^[-\s]+/, ""))
        .join("\n");

      let slide = pptx.addSlide();
      slide.addText(titleText, { x: 0.5, y: 0.5, fontSize: 24, bold: true });
      slide.addText(bodyText, { x: 0.5, y: 1.5, fontSize: 16 });
    });

    // ファイルの保存
    const fileName = `${topic.replace(/\s+/g, "_")}.pptx`;
    const filePath = `/tmp/${fileName}`;
    await pptx.writeFile({ fileName: filePath });

    // S3にアップロード
    const s3 = new S3();
    const fileData = require("fs").readFileSync(filePath);
    await s3
      .putObject({
        Bucket: S3_BUCKET_NAME!,
        Key: fileName,
        Body: fileData,
        ContentType:
          "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      })
      .promise();

    // 署名付きURLを取得
    const url = s3.getSignedUrl("getObject", {
      Bucket: S3_BUCKET_NAME!,
      Key: fileName,
      Expires: 3600,
    });

    return {
      messageVersion: "1.0",
      response: {
        actionGroup: event.actionGroup,
        apiPath: event.apiPath,
        httpMethod: event.httpMethod,
        httpStatusCode: 200,
        responseBody: {
          "application/json": {
            body: JSON.stringify({ signed_url: url }),
          },
        },
      },
    };
  } catch (error) {
    console.error(error);
    return {
      messageVersion: "1.0",
      response: {
        actionGroup: event.actionGroup,
        apiPath: event.apiPath,
        httpMethod: event.httpMethod,
        httpStatusCode: 500,
        responseBody: {
          "application/json": {
            body: JSON.stringify({ error: "Internal Server Error" }),
          },
        },
      },
    };
  }
};
