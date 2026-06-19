import { GoogleGenAI } from "@google/genai";
import type { GeminiModel, GeminiSettings } from "@/lib/types";

// Maps our UI-facing model ids to the actual Gemini API model strings.
// "gemini-3.1-pro" is the name shown in the picker to match the Galaxy.ai
// reference; swap the right-hand side if/when that exact model string ships.
const MODEL_MAP: Record<GeminiModel, string> = {
  "gemini-3.1-pro": "gemini-2.5-pro",
  "gemini-2.5-pro": "gemini-2.5-pro",
  "gemini-2.5-flash": "gemini-2.5-flash",
};

export interface RunGeminiInput {
  model: GeminiModel;
  prompt: string;
  systemPrompt?: string;
  imageUrls: string[];
  settings: GeminiSettings;
}

async function urlToInlinePart(url: string) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch media for Gemini input: ${url}`);
  const mimeType = res.headers.get("content-type") ?? "application/octet-stream";
  const buf = Buffer.from(await res.arrayBuffer());
  return { inlineData: { mimeType, data: buf.toString("base64") } };
}

export async function runGemini(input: RunGeminiInput): Promise<string> {
  const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  if (!apiKey) throw new Error("GOOGLE_GENERATIVE_AI_API_KEY is not set");

  const ai = new GoogleGenAI({ apiKey });
  const imageParts = await Promise.all(input.imageUrls.map(urlToInlinePart));

  const response = await ai.models.generateContent({
    model: MODEL_MAP[input.model],
    contents: [input.prompt, ...imageParts],
    config: {
      systemInstruction: input.systemPrompt || undefined,
      temperature: input.settings.temperature,
      maxOutputTokens: input.settings.maxOutputTokens,
      topP: input.settings.topP,
    },
  });

  return response.text ?? "";
}
