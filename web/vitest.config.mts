import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    // Payoff logic and other pure modules run in plain Node; no DOM needed.
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
