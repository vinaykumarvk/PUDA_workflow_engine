import type { AddressInfo } from "node:net";
import autocannon, {
  type Options as AutocannonOptions,
  type Result as AutocannonResult,
} from "autocannon";
import { buildApp } from "../src/app";

function parsePositiveInt(rawValue: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(rawValue || "", 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return parsed;
}

function parseNonNegativeInt(rawValue: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(rawValue || "", 10);
  if (!Number.isFinite(parsed) || parsed < 0) return fallback;
  return parsed;
}

function runAutocannon(options: AutocannonOptions): Promise<AutocannonResult> {
  return new Promise((resolve, reject) => {
    autocannon(options, (error, result) => {
      if (error) {
        reject(error);
        return;
      }
      resolve(result);
    });
  });
}

async function main() {
  process.env.NODE_ENV = "test";
  process.env.VITEST = "true";
  if (!process.env.ALLOWED_ORIGINS) {
    process.env.ALLOWED_ORIGINS = "http://localhost:5173";
  }
  if (!process.env.RATE_LIMIT_MAX) {
    process.env.RATE_LIMIT_MAX = "1000000";
  }

  const durationSeconds = parsePositiveInt(process.env.LOAD_TEST_DURATION_SECONDS, 15);
  const connections = parsePositiveInt(process.env.LOAD_TEST_CONNECTIONS, 25);
  const pipelining = parsePositiveInt(process.env.LOAD_TEST_PIPELINING, 1);
  const p95BudgetMs = parsePositiveInt(process.env.LOAD_TEST_P95_MS_BUDGET, 350);
  const minRps = parsePositiveInt(process.env.LOAD_TEST_MIN_RPS, 40);
  const maxErrors = parseNonNegativeInt(process.env.LOAD_TEST_MAX_ERRORS, 0);

  const app = await buildApp(false);
  try {
    await app.listen({ host: "127.0.0.1", port: 0 });
    const address = app.server.address();
    if (!address || typeof address === "string") {
      throw new Error("Failed to resolve local server address for load smoke");
    }
    const baseUrl = `http://127.0.0.1:${(address as AddressInfo).port}`;
    const targetUrl = `${baseUrl}/api/v1/config/services`;

    const result = await runAutocannon({
      url: targetUrl,
      method: "GET",
      duration: durationSeconds,
      connections,
      pipelining,
      headers: {
        "x-request-id": "load-smoke",
      },
    });

    const p95Ms = Number(result.latency?.p95 || 0);
    const avgRps = Number(result.requests?.average || 0);
    const totalErrors = Number(result.errors || 0) + Number(result.timeouts || 0);
    const non2xx = Number(result.non2xx || 0);

    const failures: string[] = [];
    if (totalErrors > maxErrors) {
      failures.push(`errors/timeouts ${totalErrors} exceeded max ${maxErrors}`);
    }
    if (non2xx > 0) {
      failures.push(`received ${non2xx} non-2xx responses`);
    }
    if (p95Ms > p95BudgetMs) {
      failures.push(`p95 latency ${p95Ms}ms exceeded budget ${p95BudgetMs}ms`);
    }
    if (avgRps < minRps) {
      failures.push(`average throughput ${avgRps.toFixed(2)} rps below floor ${minRps}`);
    }

    console.log(
      JSON.stringify(
        {
          targetUrl,
          durationSeconds,
          connections,
          pipelining,
          latencyMs: {
            average: Number(result.latency?.average || 0),
            p95: p95Ms,
            p99: Number(result.latency?.p99 || 0),
          },
          requestsPerSecond: {
            average: avgRps,
            max: Number(result.requests?.max || 0),
          },
          errors: {
            errors: Number(result.errors || 0),
            timeouts: Number(result.timeouts || 0),
            non2xx,
          },
        },
        null,
        2
      )
    );

    if (failures.length > 0) {
      throw new Error(`[LOAD_SMOKE_FAILED] ${failures.join("; ")}`);
    }

    console.log("[LOAD_SMOKE_OK] API load smoke thresholds satisfied");
  } finally {
    await app.close();
  }
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exit(1);
});
