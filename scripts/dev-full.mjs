/* global console, process */
// 一条命令同时启动：DeepSeek 本地代理 + Vite 开发服务器
import { spawn } from "node:child_process";
import { resolve } from "node:path";

const processes = [
  spawn(process.execPath, [resolve("server/deepseek-proxy.mjs")], { stdio: "inherit" }),
  spawn(process.execPath, [resolve("node_modules/vite/bin/vite.js")], { stdio: "inherit" }),
];

function stop() {
  for (const child of processes) if (!child.killed) child.kill();
}

for (const child of processes) {
  child.on("exit", (code) => {
    if (code && code !== 0) console.error(`开发服务异常退出：${code}`);
  });
}

process.on("SIGINT", () => { stop(); process.exit(0); });
process.on("SIGTERM", () => { stop(); process.exit(0); });
