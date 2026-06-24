import { task } from "@trigger.dev/sdk/v3";
import { geminiPayloadSchema } from "@/lib/validation";
import { runGemini } from "@/lib/gemini-client";
import { z } from "zod";

export type GeminiTaskPayload = z.infer<typeof geminiPayloadSchema>;

export interface GeminiTaskOutput {
  response: string;
}

export const geminiTask = task({
  id: "gemini-generate",
  maxDuration: 120,
  retry: {
    maxAttempts: 4,
    minTimeoutInMs: 2000,
    maxTimeoutInMs: 15000,
    factor: 2,
  },
  run: async (payload: GeminiTaskPayload): Promise<GeminiTaskOutput> => {
    const input = geminiPayloadSchema.parse(payload);
    const response = await runGemini({
      model: input.model,
      prompt: input.prompt,
      systemPrompt: input.systemPrompt,
      imageUrls: input.imageUrls,
      settings: input.settings,
    });
    return { response };
  },
});