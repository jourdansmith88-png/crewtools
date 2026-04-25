export type AIWorkflowId =
  | "contractCopilot"
  | "contractCopilotSynthesis"
  | "tripScreenshotParser"
  | "tripParser"
  | "timecardParser"
  | "payAudit"
  | "pbsBuilder";

export type AIContextBlock = {
  label: string;
  content: string;
};

export type AIWorkflowPrompt = {
  systemPrompt: string;
  userPrompt: string;
  contextBlocks?: AIContextBlock[];
  userImages?: Array<{
    dataUrl: string;
    label?: string;
  }>;
  temperature?: number;
};

export type AIValueSchema<T> = {
  name: string;
  parse: (value: unknown) => T;
  jsonSchema?: Record<string, unknown>;
};

export type AIModelUsage = {
  inputTokens?: number;
  outputTokens?: number;
};

export type AIModelStructuredRequest<TOutput> = {
  workflowId: AIWorkflowId;
  prompt: AIWorkflowPrompt;
  outputSchema: AIValueSchema<TOutput>;
  metadata?: Record<string, string | number | boolean>;
};

export type AIModelStructuredResponse<TOutput> = {
  output: TOutput;
  rawText?: string;
  usage?: AIModelUsage;
};

export type AIWorkflowRunResult<TFinalOutput> = {
  output: TFinalOutput;
  rawText?: string;
  usage?: AIModelUsage;
  debug: {
    workflowId: AIWorkflowId;
    startedAtIso: string;
    finishedAtIso: string;
  };
};

export type AIWorkflowDefinition<TInput, TContext, TModelOutput, TFinalOutput = TModelOutput> = {
  id: AIWorkflowId;
  displayName: string;
  description: string;
  inputSchema: AIValueSchema<TInput>;
  outputSchema: AIValueSchema<TModelOutput>;
  groundingPolicy?: import("../retrieval/types.ts").WorkflowGroundingPolicy;
  buildContext: (input: TInput) => Promise<TContext> | TContext;
  buildPrompt: (input: TInput, context: TContext) => AIWorkflowPrompt;
  postProcess?: (args: {
    input: TInput;
    context: TContext;
    modelOutput: TModelOutput;
  }) => Promise<TFinalOutput> | TFinalOutput;
};

export type AIWorkflowLogger = {
  onWorkflowStart?: (payload: {
    workflowId: AIWorkflowId;
    inputSummary: string;
    startedAtIso: string;
  }) => void;
  onModelRawResponse?: (payload: {
    workflowId: AIWorkflowId;
    attempt: number;
    rawText: string;
  }) => void;
  onValidationAccepted?: (payload: {
    workflowId: AIWorkflowId;
    attempt: number;
  }) => void;
  onValidationFailure?: (payload: {
    workflowId: AIWorkflowId;
    attempt: number;
    reason: string;
    rawText?: string;
  }) => void;
  onWorkflowSuccess?: (payload: {
    workflowId: AIWorkflowId;
    finishedAtIso: string;
    usage?: AIModelUsage;
  }) => void;
  onWorkflowError?: (payload: {
    workflowId: AIWorkflowId;
    finishedAtIso: string;
    error: Error;
  }) => void;
};
