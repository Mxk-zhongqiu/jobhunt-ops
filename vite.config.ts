import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  base: "./",
  server: {
    // 显式绑定 IPv4 回环：避免 Windows 下 localhost 解析到 ::1 导致 listen EACCES
    host: "127.0.0.1",
    port: 5173,
    proxy: {
      // 本地 DeepSeek 安全代理（server/deepseek-proxy.mjs）
      "/api/ai": "http://127.0.0.1:8787",
    },
  },
});
