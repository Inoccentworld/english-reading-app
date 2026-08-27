import { GoogleGenAI } from "@google/genai";
import { NextResponse } from "next/server";
import { GEMINI_EXPLANATION_PROMPT } from "@/lib/geminiExplanationPrompt";

type ConversationMessage = {
  role: "user" | "model";
  text: string;
};

type ExplainRequest = {
  selection?: string;
  context?: {
    previous?: string;
    current?: string;
    next?: string;
  };
  messages?: ConversationMessage[];
};

const MAX_TEXT_LENGTH = 5000;
const MAX_MESSAGES = 20;

export async function POST(request: Request) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "GEMINI_API_KEYが設定されていません" },
      { status: 500 },
    );
  }

  try {
    const body = (await request.json()) as ExplainRequest;
    const selection = body.selection?.trim();
    if (!selection || selection.length > MAX_TEXT_LENGTH) {
      return NextResponse.json(
        { error: "解説する表現を正しく指定してください" },
        { status: 400 },
      );
    }

    const messages = (body.messages ?? []).slice(-MAX_MESSAGES);
    if (
      messages.some(
        (message) =>
          !["user", "model"].includes(message.role) ||
          !message.text?.trim() ||
          message.text.length > MAX_TEXT_LENGTH,
      )
    ) {
      return NextResponse.json(
        { error: "会話内容が正しくありません" },
        { status: 400 },
      );
    }

    const context = body.context ?? {};
    const initialRequest = [
      `選択された表現: ${selection}`,
      context.previous ? `直前の文:\n${context.previous}` : "",
      context.current ? `選択箇所を含む文:\n${context.current}` : "",
      context.next ? `直後の文:\n${context.next}` : "",
    ]
      .filter(Boolean)
      .join("\n\n");

    const ai = new GoogleGenAI({ apiKey });
    const response = await ai.models.generateContent({
      model: "gemini-3.6-flash",
      contents: [
        { role: "user", parts: [{ text: initialRequest }] },
        ...messages.map((message) => ({
          role: message.role,
          parts: [{ text: message.text.trim() }],
        })),
      ],
      config: {
        systemInstruction: GEMINI_EXPLANATION_PROMPT,
      },
    });

    const text = response.text?.trim();
    if (!text) {
      return NextResponse.json(
        { error: "AIから回答を取得できませんでした" },
        { status: 502 },
      );
    }

    return NextResponse.json({ text });
  } catch (error) {
    console.error("Gemini explanation error", error);
    return NextResponse.json(
      { error: "AI解説の取得に失敗しました" },
      { status: 500 },
    );
  }
}
