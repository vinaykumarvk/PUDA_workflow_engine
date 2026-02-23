import { loadServicePacks } from "../src/service-packs";

async function main() {
  const services = await loadServicePacks();
  if (services.length === 0) {
    throw new Error("No service packs found under service-packs/");
  }

  const keys = services.map((service) => service.serviceKey).sort();
  console.log(`[SERVICE_PACK_PREFLIGHT_OK] Validated ${services.length} service pack(s): ${keys.join(", ")}`);
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[SERVICE_PACK_PREFLIGHT_FAILED] ${message}`);
  process.exit(1);
});
