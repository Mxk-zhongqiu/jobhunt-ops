/* global console, process */
// AI 安全代码级验收：确保密钥只在服务端、最小上下文、确认写入等门禁不被破坏。
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const read = (path) => readFileSync(resolve(root, path), "utf8");
const checks = [];
const expect = (label, condition) => checks.push({ label, condition });

const envExample = read(".env.example");
const gitignore = read(".gitignore");
const proxy = read("server/deepseek-proxy.mjs");
const cloudProxy = read("functions/index.js");
const worker = read("worker/ai-proxy.js");
const adapter = read("src/services/ai/DeepSeekAdapter.ts");
const services = read("src/services/ai/index.ts");
const workspace = read("src/components/ai/AIWorkspace.tsx");
const seed = read("src/data/seed.ts");
const vite = read("vite.config.ts");

expect("API 密钥使用服务端环境变量", envExample.includes("DEEPSEEK_API_KEY=") && !envExample.includes("VITE_DEEPSEEK"));
expect("真实 .env 已被忽略", gitignore.split(/\r?\n/).includes(".env"));
expect("代理只绑定本机回环地址", proxy.includes('server.listen(port, "127.0.0.1"'));
expect("浏览器代码不包含 DeepSeek API 密钥", !adapter.includes("DEEPSEEK_API_KEY") && !workspace.includes("DEEPSEEK_API_KEY"));
expect("代理使用 Bearer 鉴权", proxy.includes("Authorization: `Bearer ${apiKey}`"));
expect("结构化草稿启用 JSON Output", proxy.includes('response_format: { type: "json_object" }') && proxy.includes("只输出一个合法 json 对象"));
expect("代理限制上下文与输出规模", proxy.includes("maxContextCharacters") && proxy.includes("max_tokens: maxTokens"));
expect("代理实现超时与有限重试", proxy.includes("AbortController") && proxy.includes("attempt < 2") && proxy.includes("timeoutMs"));
expect("仅重试限流和服务端故障", proxy.includes("[429, 500, 503]"));
expect("调用日志不保存上下文正文", proxy.includes("callLogs") && !proxy.includes("authorizedContext: contextText"));
expect("DeepSeekAdapter 只裁剪显式勾选对象", ["selected.interviewIds.includes", "selected.applicationIds.includes", "selected.topicIds.includes", "selected.projectIds.includes"].every((value) => adapter.includes(value)));
expect("DeepSeek 响应经过本地类型校验", adapter.includes("parsePayload") && adapter.includes("INVALID_PROVIDER_RESPONSE"));
expect("前端只调用本地代理", adapter.includes('fetch("/api/ai/deepseek"') && !adapter.includes("api.deepseek.com"));
expect("AIService 工厂支持 Mock 与 DeepSeek", services.includes("createAIService") && services.includes("new DeepSeekAdapter") && services.includes("new MockAdapter"));
expect("提供商默认 Mock 且可切换", seed.includes('aiProvider: "mock"') && workspace.includes("改用本地 Mock"));
expect("正式写入只在确认分支（复盘写入）", workspace.indexOf("const accept = () =>") < workspace.indexOf("updateInterview("));
expect("Vite 仅代理本地 AI 路径", vite.includes('"/api/ai": "http://127.0.0.1:8787"'));

// ── 云函数（functions/index.js）安全门禁 ──
expect("云函数密钥只用环境变量", cloudProxy.includes("process.env.DEEPSEEK_API_KEY") && !/sk-[A-Za-z0-9]{12,}/.test(cloudProxy));
expect("云函数要求登录才能调用", cloudProxy.includes("request.auth") && cloudProxy.includes('HttpsError("unauthenticated"'));
expect("云函数使用 Bearer 鉴权", cloudProxy.includes("Authorization: `Bearer ${apiKey}`"));
expect("云函数结构化草稿启用 JSON Output", cloudProxy.includes('response_format: { type: "json_object" }') && cloudProxy.includes("只输出一个合法 json 对象"));
expect("云函数限制上下文与输出规模", cloudProxy.includes("maxContextCharacters") && cloudProxy.includes("max_tokens: maxTokens"));
expect("云函数超时与有限重试", cloudProxy.includes("AbortController") && cloudProxy.includes("attempt < 2") && cloudProxy.includes("timeoutMs"));
expect("云函数仅重试限流和服务端故障", cloudProxy.includes("[429, 500, 503]"));
expect("生产环境浏览器只调 Worker 代理", adapter.includes("VITE_AI_PROXY_URL") && !adapter.includes("api.deepseek.com") && !adapter.includes("httpsCallable"));
expect("云函数不记录上下文正文", !cloudProxy.includes("callLogs"));

// ── Cloudflare Worker 代理（worker/ai-proxy.js）安全门禁 ──
expect("Worker 密钥只用环境变量", worker.includes("env.DEEPSEEK_API_KEY") && !/sk-[A-Za-z0-9]{12,}/.test(worker));
expect("Worker 校验登录令牌", worker.includes("idToken") && worker.includes("accounts:lookup"));
expect("浏览器向 Worker 转发用户令牌", adapter.includes("Authorization: `Bearer ${idToken}`"));
expect("Worker 使用 Bearer 鉴权调用 DeepSeek", worker.includes("Authorization: `Bearer ${env.DEEPSEEK_API_KEY}`"));
expect("Worker 结构化草稿启用 JSON Output", worker.includes('response_format: { type: "json_object" }') && worker.includes("只输出一个合法 json 对象"));
expect("Worker 限制上下文与输出规模", worker.includes("maxContextCharacters") && worker.includes("max_tokens: maxTokens"));
expect("Worker 超时与有限重试", worker.includes("AbortController") && worker.includes("attempt < 2") && worker.includes("timeoutMs"));
expect("Worker 仅重试限流和服务端故障", worker.includes("[429, 500, 503]"));
expect("Worker 不记录上下文正文", !worker.includes("callLogs"));
expect("Worker 带跨域 CORS 头", worker.includes("Access-Control-Allow-Origin"));

const failed = checks.filter((check) => !check.condition);
if (failed.length) {
  console.error(`AI 安全验收失败：${failed.length} / ${checks.length} 项未通过。`);
  for (const check of failed) console.error(`- ${check.label}`);
  process.exit(1);
}
console.log(`AI 安全代码级验收通过：${checks.length} 项检查全部通过。`);
