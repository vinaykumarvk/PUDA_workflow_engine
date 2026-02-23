import { getLogContext } from "./log-context";
import { trace } from "@opentelemetry/api";

type LogLevel = "info" | "warn" | "error";

type LogFields = Record<string, unknown>;

const REDACT_KEY_PATTERN = /(password|token|secret|signature|authorization|cookie|aadhar|aadhaar|pan|email|phone|mobile)/i;
const MAX_REDACTION_DEPTH = 6;

function redactValue(value: unknown, depth = 0): unknown {
  if (depth >= MAX_REDACTION_DEPTH) return "[MAX_DEPTH]";
  if (value == null) return value;
  if (Array.isArray(value)) {
    return value.map((entry) => redactValue(entry, depth + 1));
  }
  if (typeof value === "object") {
    const output: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
      if (REDACT_KEY_PATTERN.test(key)) {
        output[key] = "[REDACTED]";
      } else {
        output[key] = redactValue(entry, depth + 1);
      }
    }
    return output;
  }
  return value;
}

function write(level: LogLevel, message: string, fields?: LogFields): void {
  const context = getLogContext();
  const spanContext = trace.getActiveSpan()?.spanContext();
  const payload = {
    timestamp: new Date().toISOString(),
    level,
    message,
    requestId: context?.requestId ?? null,
    traceId: spanContext?.traceId ?? null,
    spanId: spanContext?.spanId ?? null,
    ...(fields ? (redactValue(fields) as LogFields) : {}),
  };
  const line = JSON.stringify(payload);
  if (level === "error") {
    console.error(line);
    return;
  }
  if (level === "warn") {
    console.warn(line);
    return;
  }
  console.log(line);
}

export function logInfo(message: string, fields?: LogFields): void {
  write("info", message, fields);
}

export function logWarn(message: string, fields?: LogFields): void {
  write("warn", message, fields);
}

export function logError(message: string, fields?: LogFields): void {
  write("error", message, fields);
}
