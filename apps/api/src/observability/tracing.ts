import { diag, DiagConsoleLogger, DiagLogLevel } from "@opentelemetry/api";
import { getNodeAutoInstrumentations } from "@opentelemetry/auto-instrumentations-node";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { FastifyInstrumentation } from "@opentelemetry/instrumentation-fastify";
import { NodeSDK } from "@opentelemetry/sdk-node";

let sdk: NodeSDK | null = null;
let started = false;

function parseDiagLogLevel(rawLevel: string | undefined): DiagLogLevel | null {
  if (!rawLevel) return null;
  switch (rawLevel.trim().toUpperCase()) {
    case "ALL":
      return DiagLogLevel.ALL;
    case "VERBOSE":
      return DiagLogLevel.VERBOSE;
    case "DEBUG":
      return DiagLogLevel.DEBUG;
    case "INFO":
      return DiagLogLevel.INFO;
    case "WARN":
      return DiagLogLevel.WARN;
    case "ERROR":
      return DiagLogLevel.ERROR;
    case "NONE":
      return DiagLogLevel.NONE;
    default:
      return null;
  }
}

function shouldEnableTracing(): boolean {
  const explicit = process.env.OTEL_ENABLED;
  if (explicit === "false") return false;
  if (explicit === "true") return true;
  // Default: enable only in non-test runtime.
  return process.env.NODE_ENV !== "test" && process.env.VITEST !== "true";
}

function buildTraceExporter(): OTLPTraceExporter | undefined {
  const endpoint = process.env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT
    || process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
  if (!endpoint || endpoint.trim().length === 0) return undefined;
  return new OTLPTraceExporter({ url: endpoint.trim() });
}

export function startTracing(): void {
  if (started) return;
  if (!shouldEnableTracing()) return;

  const diagLevel = parseDiagLogLevel(process.env.OTEL_DIAG_LOG_LEVEL);
  if (diagLevel != null) {
    diag.setLogger(new DiagConsoleLogger(), diagLevel);
  }

  try {
    const traceExporter = buildTraceExporter();
    sdk = new NodeSDK({
      serviceName: process.env.OTEL_SERVICE_NAME || "puda-api",
      traceExporter,
      instrumentations: [
        new FastifyInstrumentation({
          requestHook: (span, info) => {
            const reqId = String(info?.request?.id || "").trim();
            if (reqId) {
              span.setAttribute("request.id", reqId);
            }
          },
        }),
        getNodeAutoInstrumentations({
          "@opentelemetry/instrumentation-fs": { enabled: false },
          // Fastify is explicitly instrumented above to inject request.id attributes.
          "@opentelemetry/instrumentation-fastify": { enabled: false },
          "@opentelemetry/instrumentation-pg": {
            enhancedDatabaseReporting: false,
          },
        }),
      ],
    });
    sdk.start();
    started = true;
  } catch (error) {
    // Tracing must never block API startup.
    // eslint-disable-next-line no-console
    console.error("Failed to initialize OpenTelemetry tracing", error);
  }
}

export async function shutdownTracing(): Promise<void> {
  if (!sdk || !started) return;
  await sdk.shutdown();
  started = false;
  sdk = null;
}
