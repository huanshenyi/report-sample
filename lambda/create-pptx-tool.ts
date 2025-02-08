import { S3 } from "aws-sdk";
import PptxGenJS from "pptxgenjs";
import { AgentInput, AgentOutput } from "../lib/construct/type";

const S3_BUCKET_NAME = process.env.S3_BUCKET_NAME;

export const handler = async (event: AgentInput): Promise<AgentOutput> => {
  const props = event.requestBody.content["application/json"].properties;
  try {
    let topic = "";
    let content = "";
    let agenda = "";
    let backgroundColor = "f0ffff";
    for (const prop of props) {
      if (prop.name === "topic") {
        topic = prop.value;
      } else if (prop.name === "agenda") {
        agenda = prop.value;
      } else if (prop.name === "content") {
        content = prop.value.trim();
      } else if (prop.name === "backgroundColor") {
        backgroundColor = prop.value;
      }
    }

    const slidesContent = content.split("\n\n");

    // プレゼンテーション作成
    const pptx = new PptxGenJS();
    pptx.defineLayout({ name: "WIDESCREEN", width: 13.333, height: 7.5 });
    pptx.layout = "WIDESCREEN";

    const defaultTextStyle = {
      fontFace: "Yu Gothic",
      color: "363636",
      align: "left" as const,
    };

    // タイトルスライド
    let slide = pptx.addSlide();
    slide.background = { color: backgroundColor };
    slide.addText(topic, {
      x: 0,
      y: "35%",
      w: "100%",
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

    if (agenda) {
      let slide = pptx.addSlide();
      slide.background = { color: backgroundColor };

      // CONTENTSヘッダー
      slide.addShape(pptx.ShapeType.rect, {
        x: 0,
        y: 0,
        w: "30%", // ヘッダーの幅を調整
        h: 0.8, // ヘッダーの高さを調整
        fill: { color: "4472C4" },
      });

      slide.addText("Agenda", {
        x: 0.5,
        y: 0.5,
        fontSize: 32,
        bold: true,
        ...defaultTextStyle,
      });

      // 下線
      slide.addShape(pptx.ShapeType.line, {
        x: 0,
        y: 0.8,
        w: "100%",
        h: 0,
        line: { color: "000000", width: 1 },
      });

      // コンテンツ項目
      const agendaItems = agenda.split(",").map((item, index) => ({
        text: `${index + 1}. ${item.trim()}`, // 番号を追加
        options: {
          fontSize: 24,
          color: "000000",
          bold: false,
          breakLine: true,
          spacing: { line: 1.5 }, // 行間を広げる
        },
      }));

      slide.addText(agendaItems, {
        x: 0.3,
        y: 1.6,
        w: "90%",
        ...defaultTextStyle,
      });
    }

    // コンテンツスライド
    slidesContent.forEach((slideContent) => {
      const lines = slideContent.split("\n");
      const titleText = lines[0].replace(/^[-\s]+/, "");
      const bodyText = lines
        .slice(1)
        .map((line) => line.replace(/^[-\s]+/, ""))
        .join("\n");

      let slide = pptx.addSlide();
      slide.background = { color: backgroundColor };
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
