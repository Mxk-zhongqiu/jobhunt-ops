// 种子数据隔离门禁：确认 dist 产物只包含预期种子（真实 / 演示），
// 防止真实求职数据混进公网展示包（或演示数据混进真实构建）。
// 用法：node scripts/verify-seed.mjs --expect-real | --expect-demo
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const args = process.argv.slice(2);
const expectDemo = args.includes("--expect-demo");
const expectReal = args.includes("--expect-real");
if (expectDemo === expectReal) {
  console.error("用法：node scripts/verify-seed.mjs --expect-real | --expect-demo");
  process.exit(2);
}

const dist = join(dirname(fileURLToPath(import.meta.url)), "..", "dist", "assets");
let bundle = "";
for (const file of readdirSync(dist)) {
  if (file.endsWith(".js")) bundle += readFileSync(join(dist, file), "utf8");
}

// 真实种子专有标记（src/data/seed.ts 冲刺层公司）与演示种子专有标记（src/data/demoSeed.ts 虚构公司）。
// 注意：标记必须"只出现在种子数据里"——"启林"出现在表单占位符（例如：启林投资）不能用作标记；
// "DTL" 太短可能误中压缩产物，同样排除。
// 修改种子数据时若新增公司名，请同步维护这两组标记。
const realMarkers = ["幻方", "九坤", "明汯", "衍复", "宽德", "灵均", "因诺", "蒙玺", "迎水", "佳期"];
const demoMarkers = ["北辰量化", "青禾资本", "澜舟资产", "南岭基金"];

const hasReal = realMarkers.some((marker) => bundle.includes(marker));
const hasDemo = demoMarkers.some((marker) => bundle.includes(marker));

if (expectDemo) {
  if (hasDemo && !hasReal) {
    console.log("✅ 演示包检查通过：包含演示数据，且未包含任何真实种子数据。");
    process.exit(0);
  }
  console.error(`❌ 演示包检查失败：演示数据=${hasDemo}，真实数据=${hasReal}（期望 演示=true、真实=false）。`);
  console.error("   真实求职数据可能混入了公网产物，禁止部署！请检查 seed.ts / demoSeed.ts 的顶层副作用与 __DEMO_MODE__ 分支。");
  process.exit(1);
}

if (hasReal && !hasDemo) {
  console.log("✅ 真实包检查通过：包含真实种子数据，且未包含演示数据。");
  process.exit(0);
}
console.error(`❌ 真实包检查失败：真实数据=${hasReal}，演示数据=${hasDemo}（期望 真实=true、演示=false）。`);
process.exit(1);
