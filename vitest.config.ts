import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./tests/setup.ts"],
    include: ["tests/**/*.test.ts", "tests/**/*.test.tsx"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json-summary", "lcov"],
      reportsDirectory: "coverage/frontend",
      include: [
        "src/components/Hero.tsx",
        "src/components/FishSpotlight.tsx",
        "src/components/FishModal.tsx",
        "src/components/BadgeToast.tsx",
        "src/components/BadgeHistory.tsx"
      ]
    }
  }
});
