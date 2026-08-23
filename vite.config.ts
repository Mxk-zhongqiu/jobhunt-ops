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
    // ⚠️ Windows 的 Hyper-V/WinNAT 会动态保留 TCP 端口段（netsh interface ipv4 show
    // excludedportrange protocol=tcp 可查），保留段内绑定即 EACCES，且范围会漂移。
    // 2026-08：原 8788/8787 落入新保留段 8691–8790，已迁移到 8801/8802；再被占时
    // 先用 netsh 查保留段，选段外端口并同步修改 .env 的 AI_PROXY_PORT 与本 proxy 地址。
    port: 8801,
    proxy: {
      // 本地 DeepSeek 安全代理（server/deepseek-proxy.mjs）
      "/api/ai": "http://127.0.0.1:8802",
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
