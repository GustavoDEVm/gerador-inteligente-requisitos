export type JsonSchema = Record<string, unknown>;

export type StructuredGenerationRequest<T> = {
  model: string;
  systemInstruction: string;
  userInput: string;
  responseJsonSchema: JsonSchema;
  temperature?: number;
  timeoutMs?: number;
  metadata?: Record<string, string>;
  /** Keeps the generic contract associated with its expected output type. */
  readonly outputType?: T;
};

export type StructuredGenerationResponse<T> = {
  output: T;
  model: string;
};

export interface AIProvider {
  readonly name: string;
  generateStructuredResponse<T>(request: StructuredGenerationRequest<T>): Promise<StructuredGenerationResponse<T>>;
}

export type AIProviderFactory = () => AIProvider;
