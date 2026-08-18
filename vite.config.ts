import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  base: "./",
  server: {
    proxy: {
      // 本地 DeepSeek 安全代理（server/deepseek-proxy.mjs）
      "/api/ai": "http://127.0.0.1:8787",
    },
  },
});
