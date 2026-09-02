// 从仓库根目录 .env 生成 extension/config.js（Firebase Web 公网配置）
// 用法：npm run ext:config
// 这些值与网站生产构建中嵌入的 VITE_FIREBASE_* 一致，属公网凭据（非机密）；
// 真正的密钥（如 DEEPSEEK_API_KEY）只存在于服务端，本脚本绝不读取。
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const envPath = path.join(root, ".env");
const outPath = path.join(root, "extension", "config.js");

if (!existsSync(envPath)) {
  console.error("缺少仓库根目录 .env（参考 .env.example）；无法生成 extension/config.js");
  process.exit(1);
}

const env = {};
for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
  const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
  if (match) env[match[1]] = match[2];
}

const {
  VITE_FIREBASE_API_KEY: apiKey,
  VITE_FIREBASE_AUTH_DOMAIN: authDomain,
  VITE_FIREBASE_PROJECT_ID: projectId,
  VITE_AI_PROXY_URL: aiProxyUrl,
} = env;
if (!apiKey || !projectId) {
  console.error(".env 缺少 VITE_FIREBASE_API_KEY / VITE_FIREBASE_PROJECT_ID，无法生成 extension/config.js");
  process.exit(1);
}

const content = `// 本文件由 \`npm run ext:config\` 从仓库根目录 .env 自动生成；修改 .env 后重新运行即可。
// 内容为 Firebase Web 公网凭据与 AI 代理公网地址（与网站生产构建一致，非机密）；真正的密钥只存在于服务端。
globalThis.EXT_CONFIG = ${JSON.stringify({ apiKey, authDomain, projectId, aiProxyUrl: aiProxyUrl || "" }, null, 2)};
`;

writeFileSync(outPath, content, "utf8");
console.log(`已生成 ${path.relative(root, outPath)}`);
