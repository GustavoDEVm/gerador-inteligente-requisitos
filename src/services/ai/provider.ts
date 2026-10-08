import { getAIConfiguration } from "@/services/ai/config";
import { aiConfigurationError } from "@/services/ai/errors";
import { GeminiProvider } from "@/services/ai/providers/gemini";
import { MockAIProvider } from "@/services/ai/providers/mock";
import type { AIProvider } from "@/services/ai/types";

export function getAIProvider(): AIProvider {
  const configuration = getAIConfiguration();

  if (configuration.provider === "gemini") {
    return new GeminiProvider(configuration.gemini);
  }

  if (configuration.provider === "mock") {
    return new MockAIProvider();
  }

  throw aiConfigurationError();
}
