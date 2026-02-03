import { formatJson } from "./output";

export class BlackboardError extends Error {
  constructor(
    message: string,
    public readonly code: string = "BLACKBOARD_ERROR"
  ) {
    super(message);
    this.name = "BlackboardError";
  }
}

/**
 * Wrap a command handler with error handling.
 * In JSON mode, outputs { ok: false, error } envelope.
 * In human mode, outputs error message to stderr.
 */
export function withErrorHandling(
  handler: (...args: any[]) => Promise<void>,
  jsonMode: () => boolean
): (...args: any[]) => Promise<void> {
  return async (...args: any[]) => {
    try {
      await handler(...args);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : String(err);
      if (jsonMode()) {
        console.log(formatJson({ error: message }, false));
      } else {
        console.error(`Error: ${message}`);
      }
      process.exitCode = 1;
    }
  };
}
