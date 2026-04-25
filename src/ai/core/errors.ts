export class AIWorkflowError extends Error {
  code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "AIWorkflowError";
    this.code = code;
  }
}

export class AIValidationError extends AIWorkflowError {
  rawText?: string;
  partialOutput?: unknown;

  constructor(message: string, options?: { rawText?: string; partialOutput?: unknown }) {
    super("validation_error", message);
    this.name = "AIValidationError";
    this.rawText = options?.rawText;
    this.partialOutput = options?.partialOutput;
  }
}

export class AIModelError extends AIWorkflowError {
  constructor(message: string) {
    super("model_error", message);
    this.name = "AIModelError";
  }
}

export class AIConfigurationError extends AIWorkflowError {
  constructor(message: string) {
    super("configuration_error", message);
    this.name = "AIConfigurationError";
  }
}
