import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    include: [
      "src/workflow.engine.integration.test.ts",
      "src/payments.lifecycle.integration.test.ts",
      "src/payments.callback.integration.test.ts",
    ],
    setupFiles: ["./src/test-env.ts"],
    testTimeout: 20000,
    sequence: { concurrent: false },
    coverage: {
      enabled: true,
      provider: "v8",
      reporter: ["text", "json-summary"],
      reportsDirectory: "./coverage-critical",
      include: ["src/workflow.ts", "src/payments.ts"],
      all: true,
      thresholds: {
        perFile: true,
        lines: 60,
        functions: 65,
        statements: 60,
        branches: 55,
      },
    },
  },
});
