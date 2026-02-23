import dotenv from "dotenv";
import path from "path";
import { shutdownTracing, startTracing } from "./observability/tracing";

// Load .env for local dev; in Cloud Run, env vars are injected directly
dotenv.config({ path: path.resolve(__dirname, "..", "..", "..", ".env") });

async function main() {
  startTracing();
  const { buildApp } = await import("./app");
  const app = await buildApp(true);
  // Cloud Run provides PORT env var; fall back to API_PORT for local dev
  const port = Number(process.env.PORT || process.env.API_PORT || 3001);
  const host = process.env.API_HOST || "0.0.0.0";

  const SHUTDOWN_TIMEOUT_MS = Number(process.env.SHUTDOWN_TIMEOUT_MS) || 15_000;
  let isShuttingDown = false;

  const shutdown = async (signal: string) => {
    if (isShuttingDown) return;
    isShuttingDown = true;
    app.log.info(`Received ${signal}, shutting down gracefully (timeout ${SHUTDOWN_TIMEOUT_MS}ms)…`);

    const forceExit = setTimeout(() => {
      app.log.error("Graceful shutdown timed out, forcing exit");
      process.exit(1);
    }, SHUTDOWN_TIMEOUT_MS);
    forceExit.unref();

    try {
      await app.close();
      const { pool } = await import("./db");
      await pool.end();
      await shutdownTracing();
      clearTimeout(forceExit);
      app.log.info("Graceful shutdown complete");
      process.exit(0);
    } catch (err) {
      clearTimeout(forceExit);
      app.log.error(err, "Error during shutdown");
      process.exit(1);
    }
  };

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));

  try {
    await app.listen({ port, host });
    app.log.info(`API listening on ${host}:${port}`);
  } catch (err) {
    app.log.error(err);
    await shutdownTracing();
    process.exit(1);
  }
}

main();
