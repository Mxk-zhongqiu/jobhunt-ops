import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// build:demo（vite build --mode demo）＝ 公网展示版：种子数据切换为虚构演示数据、
// AI 仅本地 Mock。用 define 静态替换 __DEMO_MODE__，让 Rollup 彻底摇掉未使用的种子分支
// （避免真实数据/演示数据混进对方产物）。
export default defineConfig(({ mode }) => ({
  plugins: [react()],
  base: "./",
  define: {
    __DEMO_MODE__: JSON.stringify(mode === "demo"),
  },
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
  build: {
    chunkSizeWarningLimit: 1300,
    rollupOptions: {
      output: {
        // Firebase SDK 单独成包：体积大但极少变动，利于浏览器长期缓存
        manualChunks: {
          firebase: ["firebase/app", "firebase/auth", "firebase/firestore", "firebase/functions"],
        },
      },
    },
  },
}));
