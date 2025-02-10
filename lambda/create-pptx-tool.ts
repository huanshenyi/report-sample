import { S3 } from "aws-sdk";
import PptxGenJS from "pptxgenjs";
import { AgentInput, AgentOutput } from "../lib/construct/type";

// output保管用
const S3_BUCKET_NAME = process.env.S3_BUCKET_NAME;
// 素材保存用
const MATERIAL_BUCKET_NAME = process.env.MATERIAL_BUCKET_NAME;

// 固定余白・スライドサイズの定義
const MARGIN = 0.5; // 余白サイズ（インチ）
const SLIDE_WIDTH = 13.333;
const SLIDE_HEIGHT = 7.5;
const USABLE_WIDTH = SLIDE_WIDTH - 2 * MARGIN; // 余白を除いた幅

// ロゴの定義
const LOGO_KEY = "material/logo.png";
const LOGO_WIDTH = 1; // ロゴ横幅（インチ）
const LOGO_HEIGHT = 1;   // ロゴ縦幅（インチ）

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

    // S3インスタンス作成し、S3上のロゴ画像の署名付きURLを取得
    const imgS3 = new S3();
    const logoUrl = imgS3.getSignedUrl("getObject", {
      Bucket: MATERIAL_BUCKET_NAME!,
      Key: LOGO_KEY,
      Expires: 3600,
    });

    // プレゼンテーション作成
    const pptx = new PptxGenJS();
    pptx.defineLayout({ name: "WIDESCREEN", width: SLIDE_WIDTH, height: SLIDE_HEIGHT });
    pptx.layout = "WIDESCREEN";

    const defaultTextStyle = {
      fontFace: "Yu Gothic",
      color: "363636",
      align: "left" as const,
    };

    // タイトルスライド
    let slide = pptx.addSlide();
    slide.background = { color: backgroundColor };

    slide.addImage({
      path: logoUrl,
      x: SLIDE_WIDTH - MARGIN - LOGO_WIDTH,
      y: MARGIN,
      w: LOGO_WIDTH,
      h: LOGO_HEIGHT,
    });

    slide.addText(topic, {
      x: MARGIN,
      y: 2.625,
      w: USABLE_WIDTH,
      fontSize: 32,
      bold: true,
      align: "center", // 中央揃え
    });
    slide.addText(`作成日: ${new Date().toLocaleDateString("ja-JP")}`, {
      x: MARGIN,
      y: 4.125,
      w: USABLE_WIDTH,
      fontSize: 16,
      align: "center",
    });

    if (agenda) {
      let slide = pptx.addSlide();
      slide.background = { color: backgroundColor };

      slide.addImage({
        path: logoUrl,
        x: SLIDE_WIDTH - MARGIN - LOGO_WIDTH,
        y: MARGIN,
        w: LOGO_WIDTH,
        h: LOGO_HEIGHT,
      });

      // CONTENTSヘッダー
      slide.addShape(pptx.ShapeType.rect, {
        x: MARGIN,
        y: MARGIN,
        w: USABLE_WIDTH * 0.3, // USABLE_WIDTH の30%分の幅
        h: 0.8,
        fill: { color: "4472C4" },
      });

      slide.addText("Agenda", {
        x: MARGIN + 0.2,
        y: MARGIN + 0.2,
        fontSize: 32,
        bold: true,
        ...defaultTextStyle,
      });

      // 下線（余白内で全幅）
      slide.addShape(pptx.ShapeType.line, {
        x: MARGIN,
        y: MARGIN + 0.8,
        w: USABLE_WIDTH,
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
        x: MARGIN + 0.3,
        y: MARGIN + 1.6,
        w: USABLE_WIDTH * 0.9,
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
      slide.addImage({
        path: logoUrl,
        x: SLIDE_WIDTH - MARGIN - LOGO_WIDTH,
        y: MARGIN,
        w: LOGO_WIDTH,
        h: LOGO_HEIGHT,
      });

            // タイトルと本文を余白分オフセットして配置
      slide.addText(titleText, {
        x: MARGIN,
        y: 0.5,
        w: USABLE_WIDTH,
        fontSize: 24,
        bold: true,
      });
      slide.addText(bodyText, {
        x: MARGIN,
        y: 1.5,
        w: USABLE_WIDTH,
        fontSize: 16,
      });
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
