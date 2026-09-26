const REDACTED = "[REDACTED]";

const sensitiveKey =
  /(?:authorization|cookie|credential|password|passwd|secret|token|apikey|privatekey|accesskey)$/i;

function shouldRedact(key: string) {
  return sensitiveKey.test(key.replace(/[^a-z0-9]/gi, ""));
}

export function redactRunData(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redactRunData);
  if (!value || typeof value !== "object") return value;

  return Object.fromEntries(
    Object.entries(value).map(([key, entry]) => [
      key,
      shouldRedact(key) ? REDACTED : redactRunData(entry),
    ]),
  );
}

export function redactRun<T>(run: T): T {
  if (!run || typeof run !== "object") return run;
  const copy = { ...(run as Record<string, unknown>) };
  for (const field of ["metadata", "definitionSnapshot"] as const) {
    if (field in copy) copy[field] = redactRunData(copy[field]);
  }
  if (Array.isArray(copy.steps)) {
    copy.steps = copy.steps.map((step) => {
      if (!step || typeof step !== "object") return step;
      const safeStep = { ...(step as Record<string, unknown>) };
      safeStep.input = redactRunData(safeStep.input);
      safeStep.output = redactRunData(safeStep.output);
      if (Array.isArray(safeStep.attempts)) {
        safeStep.attempts = safeStep.attempts.map((attempt) => {
          if (!attempt || typeof attempt !== "object") return attempt;
          const safeAttempt = { ...(attempt as Record<string, unknown>) };
          safeAttempt.output = redactRunData(safeAttempt.output);
          return safeAttempt;
        });
      }
      return safeStep;
    });
  }
  return copy as T;
}
