import { GoogleGenAI } from "@google/genai";
import { NextResponse } from "next/server";
import {
  GEMINI_UNIT_COMBINED_PROMPT,
  GEMINI_UNIT_PHONETIC_PROMPT,
  GEMINI_UNIT_TRANSLATION_PROMPT,
} from "@/lib/geminiUnitGenerationPrompt";
import {
  getPronounceableSegments,
  getSpokenSegments,
  isPronounceableSegment,
} from "@/lib/pronunciationSegments";
import {
  GEMINI_REQUEST_TIMEOUT_MS,
  getGeminiErrorStatus,
  getGeminiErrorDetails,
  isGeminiDailyQuotaError,
} from "@/lib/geminiError";

type GenerationMode = "translation" | "phonetic" | "both";

type GenerationRequest = {
  source?: string;
  mode?: GenerationMode;
};

type GeneratedSentence = {
  original?: string;
  translation?: string;
  tokens?: string[];
};

type PhoneticReviewIssue = {
  lineIndex: number;
  expectedCount: number;
  tokens: string[];
};

const MAX_SOURCE_LENGTH = 50000;
const PRIMARY_MODEL = "gemini-3.6-flash";
const FALLBACK_MODEL = "gemini-3.5-flash-lite";

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
    if (
      mode !== "translation" &&
      mode !== "phonetic" &&
      mode !== "both"
    ) {
      return NextResponse.json(
        { error: "生成する項目が正しく指定されていません" },
        { status: 400 },
      );
    }

    const sourceLines = source.split("\n");
    const nonEmptyLines = sourceLines.filter((line) => line.trim());
    const includesTranslation = mode !== "phonetic";
    const includesPhonetic = mode !== "translation";
    const sentenceProperties = {
      ...(includesTranslation
        ? {
            original: { type: "string" },
            translation: { type: "string" },
          }
        : {}),
      ...(includesPhonetic
        ? {
            tokens: {
              type: "array",
              items: { type: "string" },
            },
          }
        : {}),
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
            required: [
              ...(includesTranslation ? ["original", "translation"] : []),
              ...(includesPhonetic ? ["tokens"] : []),
            ],
            additionalProperties: false,
          },
        },
      },
      required: ["sentences"],
      additionalProperties: false,
    };

    const passage = JSON.stringify({
      lines: nonEmptyLines.map((line) => ({
        original: line,
        ...(includesPhonetic
          ? {
              spokenSegments: getPronounceableSegments(line).map(
                (segment) => segment.text,
              ),
            }
          : {}),
      })),
    });
    const ai = new GoogleGenAI({
      apiKey,
      httpOptions: { timeout: GEMINI_REQUEST_TIMEOUT_MS },
    });
    const generate = (model: string) =>
      ai.models.generateContent({
        model,
        contents: passage,
        config: {
          systemInstruction:
            mode === "both"
              ? GEMINI_UNIT_COMBINED_PROMPT
              : mode === "translation"
                ? GEMINI_UNIT_TRANSLATION_PROMPT
                : GEMINI_UNIT_PHONETIC_PROMPT,
          responseMimeType: "application/json",
          responseJsonSchema,
        },
      });

    let activeModel = PRIMARY_MODEL;
    let response;
    try {
      response = await generate(PRIMARY_MODEL);
    } catch (primaryError) {
      const shouldUseFallback =
        getGeminiErrorStatus(primaryError) === 503 ||
        isGeminiDailyQuotaError(primaryError);
      if (!shouldUseFallback) throw primaryError;
      console.warn(
        `Gemini ${PRIMARY_MODEL} unavailable or quota exhausted; retrying with ${FALLBACK_MODEL}`,
      );
      activeModel = FALLBACK_MODEL;
      response = await generate(FALLBACK_MODEL);
    }

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
    if (
      includesTranslation &&
      !includesPhonetic &&
      parsed.sentences?.length !== nonEmptyLines.length
    ) {
      return NextResponse.json(
        { error: "生成結果の行数が原文と一致しませんでした。もう一度お試しください" },
        { status: 502 },
      );
    }

    parsed.sentences ??= [];

    if (includesPhonetic) {
      for (let index = 0; index < nonEmptyLines.length; index += 1) {
        const line = nonEmptyLines[index];
        const expectedTokenCount = getPronounceableSegments(line).length;
        if (parsed.sentences[index]?.tokens?.length === expectedTokenCount) {
          continue;
        }

        const repairSchema = {
          type: "object",
          properties: {
            sentences: {
              type: "array",
              minItems: 1,
              maxItems: 1,
              items: {
                type: "object",
                properties: {
                  tokens: {
                    type: "array",
                    minItems: expectedTokenCount,
                    maxItems: expectedTokenCount,
                    items: { type: "string" },
                  },
                },
                required: ["tokens"],
                additionalProperties: false,
              },
            },
          },
          required: ["sentences"],
          additionalProperties: false,
        };
        const repairPassage = JSON.stringify({
          context: source,
          lines: [
            {
              original: line,
              spokenSegments: getPronounceableSegments(line).map(
                (segment) => segment.text,
              ),
            },
          ],
        });
        try {
          const repairResponse = await ai.models.generateContent({
            model: activeModel,
            contents: repairPassage,
            config: {
              systemInstruction: GEMINI_UNIT_PHONETIC_PROMPT,
              responseMimeType: "application/json",
              responseJsonSchema: repairSchema,
            },
          });
          const repairText = repairResponse.text?.trim();
          if (repairText) {
            const repaired = JSON.parse(repairText) as {
              sentences?: GeneratedSentence[];
            };
            const repairedSentence = repaired.sentences?.[0];
            if (repairedSentence?.tokens) {
              parsed.sentences[index] = {
                ...parsed.sentences[index],
                tokens: repairedSentence.tokens,
              };
            }
          }
        } catch (repairError) {
          console.warn(
            `Gemini phonetic alignment repair failed at line ${index + 1}; returning the original draft`,
            repairError,
          );
        }
      }
    }

    let generatedIndex = 0;
    const reviewIssues: PhoneticReviewIssue[] = [];
    const translationLines: string[] = [];
    const phoneticLines: string[] = [];
    sourceLines.forEach((line, sourceLineIndex) => {
      if (!line.trim()) {
        translationLines.push("");
        phoneticLines.push("");
        return;
      }
      const sentence = parsed.sentences?.[generatedIndex++];
      if (includesTranslation) {
        translationLines.push(sentence?.translation?.trim() ?? "");
      }
      if (!includesPhonetic) return;

      const displaySegments = getSpokenSegments(line);
      const expectedTokens = getPronounceableSegments(line);
      const generatedTokens = sentence?.tokens ?? [];
      if (generatedTokens.length !== expectedTokens.length) {
        reviewIssues.push({
          lineIndex: sourceLineIndex,
          expectedCount: expectedTokens.length,
          tokens: generatedTokens,
        });
      }
      let generatedTokenIndex = 0;
      phoneticLines.push(
        displaySegments
          .map((segment) =>
            isPronounceableSegment(segment)
              ? (generatedTokens[generatedTokenIndex++] ?? "").trim()
              : "",
          )
          .join(" | "),
      );
    });

    const translationText = translationLines.join("\n");
    const phoneticText = phoneticLines.join("\n");

    return NextResponse.json({
      text:
        mode === "translation"
          ? translationText
          : mode === "phonetic"
            ? phoneticText
            : undefined,
      translationText: mode === "both" ? translationText : undefined,
      phoneticText: mode === "both" ? phoneticText : undefined,
      phoneticReview: includesPhonetic ? reviewIssues : undefined,
    });
  } catch (error) {
    console.error("Gemini unit text generation error", error);
    const details = getGeminiErrorDetails(error);
    return NextResponse.json(
      { error: details.message, code: details.code },
      { status: details.status },
    );
  }
}
