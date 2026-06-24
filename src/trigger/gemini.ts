import { task, AbortTaskRunError } from "@trigger.dev/sdk/v3";
import { geminiPayloadSchema } from "@/lib/validation";
import { runGemini } from "@/lib/gemini-client";
import { z } from "zod";

export type GeminiTaskPayload = z.infer<typeof geminiPayloadSchema>;

export interface GeminiTaskOutput {
  response: string;
}

export const geminiTask = task({
  id: "gemini-generate",
  maxDuration: 300,
  retry: {
    maxAttempts: 4,
    minTimeoutInMs: 10000,
    maxTimeoutInMs: 60000,
    factor: 2,
  },
  run: async (payload: GeminiTaskPayload): Promise<GeminiTaskOutput> => {
    const input = geminiPayloadSchema.parse(payload);


    try {
      const response = await runGemini({
        model: input.model,
        prompt: input.prompt,
        systemPrompt: input.systemPrompt,
        imageUrls: input.imageUrls,
        settings: input.settings,
      });
      return { response };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const errorJson = (() => { try { return JSON.parse(message); } catch { return null; } })();
      const code = errorJson?.error?.code ?? (err as { code?: number })?.code;

      // 429 = quota exhausted — retrying won't help until the quota resets
      // (daily limit). AbortTaskRunError tells Trigger.dev to NOT retry.
      if (code === 429) {
        throw new AbortTaskRunError(
          `Gemini quota exhausted (429): ${errorJson?.error?.message ?? message}. ` +
          `Check your API key's rate limits at https://ai.dev/rate-limit.`
        );
      }

      // 400 = bad request — bad payload, retrying is pointless.
      if (code === 400) {
        throw new AbortTaskRunError(
          `Gemini bad request (400): ${errorJson?.error?.message ?? message}`
        );
      }

      // 503 / other transient errors — re-throw so Trigger.dev retries
      // with the backoff configured above (10s → 20s → 40s → 60s).
      throw err;
    }
  },
});