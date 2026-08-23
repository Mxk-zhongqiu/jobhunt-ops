import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// 全部构建均输出真实数据（公网 = 真实工具，含 Firebase 云同步与云端 AI）。
// 「游客预览」虚构演示数据由应用内开关独立切换（appStore.previewDemo），与构建无关。
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
});
