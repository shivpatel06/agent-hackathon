import { createOpenAICompatible } from "@ai-sdk/openai-compatible";

export const SUBCONSCIOUS_MODEL_ID = "subconscious/tim-qwen3.6-27b";

const subconsciousProvider = createOpenAICompatible({
  name: "subconscious",
  baseURL: "https://api.subconscious.dev/v1",
  apiKey: process.env.SUBCONSCIOUS_API_KEY,
  includeUsage: true,
});

/** Subconscious defaults thinking ON — we disable it for faster, cleaner output. */
export const subconsciousModel = subconsciousProvider.languageModel(
  SUBCONSCIOUS_MODEL_ID,
  {
    transformRequestBody: (body) => ({
      ...body,
      chat_template_kwargs: { enable_thinking: false },
      ...(body.stream ? { stream_options: { include_usage: true } } : {}),
    }),
  },
);

export function requireSubconsciousApiKey() {
  const apiKey = process.env.SUBCONSCIOUS_API_KEY;
  if (!apiKey) {
    throw new Error(
      "Missing SUBCONSCIOUS_API_KEY. Get one at https://www.subconscious.dev/platform",
    );
  }
  return apiKey;
}
