import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { dedupe: ["react", "react-dom"] },
  test: {
    include: [
      "packages/*/src/**/*.test.ts",
      "services/*/src/**/*.test.ts",
      "apps/storefront/src/lib/**/*.test.ts",
      "apps/admin/src/**/*.test.tsx",
    ],
    environment: "node",
  },
});
