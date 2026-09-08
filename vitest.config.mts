import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "node",
    setupFiles: ["./vitest.setup.ts"],
    // GameScreen.diceReveal.test.tsxに既知のfull-suite-only flakeがある(単体実行では常に成功、
    // フルスイート一括実行時のみテスト順序依存で稀に失敗する)。原因調査・修正はスコープ外のまま、
    // CI(GitHub Actions)だけ再試行で吸収する。ローカルのwatch/単発実行では再試行させず、
    // 失敗をすぐそのまま見えるようにする。
    retry: process.env.CI ? 2 : 0,
  },
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "./src"),
    },
  },
});
