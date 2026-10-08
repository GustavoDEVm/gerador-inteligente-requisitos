export type AIConfiguration = {
  provider: string;
  gemini: {
    apiKey?: string;
    model?: string;
  };
};

export function getAIConfiguration(): AIConfiguration {
  const provider = (process.env.AI_PROVIDER ?? "gemini").trim().toLowerCase();

  if (provider !== "gemini") return { provider, gemini: {} };

  return {
    provider,
    gemini: {
      apiKey: process.env.GEMINI_API_KEY?.trim() || undefined,
      model: process.env.GEMINI_MODEL?.trim() || undefined,
    },
  };
}
