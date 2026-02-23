/**
 * Runtime safety helpers.
 */
export function isTestRuntime(): boolean {
  return process.env.NODE_ENV === "test" || process.env.VITEST === "true";
}
