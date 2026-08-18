import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  base: "./",
  server: {
    // 显式绑定 IPv4 回环：避免 Windows 下 localhost 解析到 ::1 导致 listen EACCES
    host: "127.0.0.1",
    // 8788：避开 Windows 保留端口段（5173 落在 Hyper-V 保留段 5141–5240 内，绑定即 EACCES）
    port: 8788,
    proxy: {
      // 本地 DeepSeek 安全代理（server/deepseek-proxy.mjs）
      "/api/ai": "http://127.0.0.1:8787",
    },
  },
});
