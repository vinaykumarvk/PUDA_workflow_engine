import dotenv from "dotenv";
import path from "path";
import { verifyAuditChainIntegrity } from "../src/audit-chain";

dotenv.config({ path: path.resolve(__dirname, "..", "..", "..", ".env") });

async function main(): Promise<void> {
  const result = await verifyAuditChainIntegrity();
  if (result.ok) {
    console.log(`[AUDIT_CHAIN_OK] verified ${result.checked} event(s)`);
    return;
  }

  const mismatch = result.mismatch;
  console.error("[AUDIT_CHAIN_BROKEN] integrity mismatch detected", {
    checkedBeforeFailure: result.checked,
    mismatch,
  });
  process.exit(1);
}

main().catch((error) => {
  console.error("[AUDIT_CHAIN_VERIFY_FAILED]", error instanceof Error ? error.message : String(error));
  process.exit(1);
});
