import { evaluateRuntimeAdapterPreflight } from "../src/runtime-adapter-preflight";

function formatIssue(prefix: string, issue: { code: string; message: string }): string {
  return `${prefix} ${issue.code}: ${issue.message}`;
}

async function main() {
  const result = evaluateRuntimeAdapterPreflight(process.env);

  for (const warning of result.warnings) {
    console.warn(formatIssue("[RUNTIME_ADAPTER_PREFLIGHT_WARNING]", warning));
  }
  if (result.errors.length > 0) {
    for (const error of result.errors) {
      console.error(formatIssue("[RUNTIME_ADAPTER_PREFLIGHT_ERROR]", error));
    }
    process.exit(1);
  }

  console.log(
    `[RUNTIME_ADAPTER_PREFLIGHT_OK] warnings=${result.warnings.length} errors=${result.errors.length}`
  );
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[RUNTIME_ADAPTER_PREFLIGHT_ERROR] ${message}`);
  process.exit(1);
});
