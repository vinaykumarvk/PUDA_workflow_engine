/**
 * Resilient outbound HTTP client with timeout, retry, and circuit breaker.
 * Used for AI endpoints (OpenAI) and payment gateway (Razorpay).
 */
import { logWarn, logError } from "./logger";

export interface ResilientFetchOptions extends RequestInit {
  /** Timeout in milliseconds (default: 30_000) */
  timeoutMs?: number;
  /** Maximum retry attempts (default: 3) */
  maxRetries?: number;
  /** Whether to retry on 5xx status codes (default: true) */
  retryOn5xx?: boolean;
}

interface CircuitState {
  failures: number;
  lastFailure: number;
  isOpen: boolean;
}

const circuits = new Map<string, CircuitState>();
const CIRCUIT_FAILURE_THRESHOLD = 5;
const CIRCUIT_RESET_MS = 60_000; // 1 minute half-open

function getCircuit(host: string): CircuitState {
  let state = circuits.get(host);
  if (!state) {
    state = { failures: 0, lastFailure: 0, isOpen: false };
    circuits.set(host, state);
  }
  return state;
}

function recordSuccess(host: string): void {
  const state = getCircuit(host);
  state.failures = 0;
  state.isOpen = false;
}

function recordFailure(host: string): void {
  const state = getCircuit(host);
  state.failures++;
  state.lastFailure = Date.now();
  if (state.failures >= CIRCUIT_FAILURE_THRESHOLD) {
    state.isOpen = true;
    logWarn("Circuit breaker opened", { host, failures: state.failures });
  }
}

function isCircuitOpen(host: string): boolean {
  const state = getCircuit(host);
  if (!state.isOpen) return false;
  // Allow half-open after reset period
  if (Date.now() - state.lastFailure > CIRCUIT_RESET_MS) {
    return false;
  }
  return true;
}

/**
 * Fetch with timeout, bounded retries, and circuit breaker.
 */
export async function resilientFetch(
  url: string,
  options: ResilientFetchOptions = {}
): Promise<Response> {
  const {
    timeoutMs = 30_000,
    maxRetries = 3,
    retryOn5xx = true,
    ...fetchInit
  } = options;

  let host: string;
  try {
    host = new URL(url).host;
  } catch {
    host = url;
  }

  if (isCircuitOpen(host)) {
    throw new Error(`Circuit breaker open for ${host} — upstream service unavailable`);
  }

  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    if (attempt > 0) {
      // Exponential backoff: 500ms, 1s, 2s
      const delayMs = Math.min(500 * Math.pow(2, attempt - 1), 4000);
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, {
        ...fetchInit,
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (retryOn5xx && response.status >= 500 && attempt < maxRetries) {
        lastError = new Error(`HTTP ${response.status} from ${host}`);
        recordFailure(host);
        continue;
      }

      recordSuccess(host);
      return response;
    } catch (err: any) {
      clearTimeout(timeoutId);
      lastError = err;
      recordFailure(host);

      if (err.name === "AbortError") {
        lastError = new Error(`Request to ${host} timed out after ${timeoutMs}ms`);
      }

      if (attempt < maxRetries) {
        logWarn("Outbound request failed, retrying", {
          host,
          attempt: attempt + 1,
          error: lastError?.message,
        });
        continue;
      }
    }
  }

  logError("Outbound request failed after all retries", {
    host,
    maxRetries,
    error: lastError?.message,
  });
  throw lastError ?? new Error(`Request to ${host} failed`);
}

/** Reset all circuit breakers (for testing). */
export function resetCircuits(): void {
  circuits.clear();
}
