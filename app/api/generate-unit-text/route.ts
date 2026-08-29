import { GoogleGenAI } from "@google/genai";
import { NextResponse } from "next/server";
import {
  GEMINI_UNIT_PHONETIC_PROMPT,
  GEMINI_UNIT_TRANSLATION_PROMPT,
} from "@/lib/geminiUnitGenerationPrompt";

type GenerationMode = "translation" | "phonetic";

type GenerationRequest = {
  source?: string;
  mode?: GenerationMode;
};

type GeneratedSentence = {
  original: string;
  translation?: string;
  tokens?: {
    originalToken: string;
    ipa: string;
  }[];
};

const MAX_SOURCE_LENGTH = 50000;

export async function POST(request: Request) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "GEMINI_API_KEYが設定されていません" },
      { status: 500 },
    );
  }

  try {
    const body = (await request.json()) as GenerationRequest;
    const source = body.source ?? "";
    const mode = body.mode;

    if (!source.trim() || source.length > MAX_SOURCE_LENGTH) {
      return NextResponse.json(
        { error: "原文を1文字以上50,000文字以内で入力してください" },
        { status: 400 },
      );
    }
    if (mode !== "translation" && mode !== "phonetic") {
      return NextResponse.json(
        { error: "生成する項目が正しく指定されていません" },
        { status: 400 },
      );
    }

    const sourceLines = source.split("\n");
    const nonEmptyLines = sourceLines.filter((line) => line.trim());
    const sentenceProperties =
      mode === "translation"
        ? {
            original: { type: "string" },
            translation: { type: "string" },
          }
        : {
            original: { type: "string" },
            tokens: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  originalToken: { type: "string" },
                  ipa: { type: "string" },
                },
                required: ["originalToken", "ipa"],
                additionalProperties: false,
              },
            },
          };
    const responseJsonSchema = {
      type: "object",
      properties: {
        sentences: {
          type: "array",
          minItems: nonEmptyLines.length,
          maxItems: nonEmptyLines.length,
          items: {
            type: "object",
            properties: sentenceProperties,
            required:
              mode === "translation"
                ? ["original", "translation"]
                : ["original", "tokens"],
            additionalProperties: false,
          },
        },
      },
      required: ["sentences"],
      additionalProperties: false,
    };

    const passage = JSON.stringify({ lines: nonEmptyLines });
    const ai = new GoogleGenAI({ apiKey });
    const response = await ai.models.generateContent({
      model: "gemini-3.6-flash",
      contents: passage,
      config: {
        systemInstruction:
          mode === "translation"
            ? GEMINI_UNIT_TRANSLATION_PROMPT
            : GEMINI_UNIT_PHONETIC_PROMPT,
        responseMimeType: "application/json",
        responseJsonSchema,
      },
    });

    const responseText = response.text?.trim();
    if (!responseText) {
      return NextResponse.json(
        { error: "AIから回答を取得できませんでした" },
        { status: 502 },
      );
    }

    const parsed = JSON.parse(responseText) as {
      sentences?: GeneratedSentence[];
    };
    if (parsed.sentences?.length !== nonEmptyLines.length) {
      return NextResponse.json(
        { error: "生成結果の行数が原文と一致しませんでした。もう一度お試しください" },
        { status: 502 },
      );
    }

    let generatedIndex = 0;
    const generatedText = sourceLines
      .map((line) => {
        if (!line.trim()) return "";
        const sentence = parsed.sentences?.[generatedIndex++];
        if (mode === "translation") {
          return sentence?.translation?.trim() ?? "";
        }

        const isChineseLine = /[\u3400-\u9fff]/u.test(line);
        const expectedTokens = isChineseLine
          ? [line.trim()]
          : line.trim().split(/\s+/);
        const generatedTokens = sentence?.tokens;
        if (generatedTokens?.length !== expectedTokens.length) {
          throw new Error("Generated phonetic tokens do not match the source");
        }
        return generatedTokens.map((token) => token.ipa.trim()).join(" | ");
      })
      .join("\n");

    return NextResponse.json({ text: generatedText });
  } catch (error) {
    console.error("Gemini unit text generation error", error);
    return NextResponse.json(
      { error: "AIによる生成に失敗しました" },
      { status: 500 },
    );
  }
}
