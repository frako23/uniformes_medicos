import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    setupFiles: ["./tests/setup.ts"],
    clearMocks: true,
    // Las suites de integración comparten una sola base y la vacían entre pruebas: se ejecutan una a la vez.
    fileParallelism: !process.env.TEST_DATABASE_URL,
  },
});
