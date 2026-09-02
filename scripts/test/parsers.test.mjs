// P1 parsers.js 纯函数单测（node --test，vm 沙箱加载，无 DOM 依赖）
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const parsersPath = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "extension", "lib", "parsers.js");
const sandbox = {};
vm.runInNewContext(readFileSync(parsersPath, "utf8"), sandbox);
const JH = sandbox.JH;

test("parseTitleJob: job_detail 标题（实测样例）", () => {
  const { position, company } = JH.parseTitleJob("「量化研究实习生（北京）招聘」_微观博易招聘-BOSS直聘");
  assert.equal(position, "量化研究实习生（北京）");
  assert.equal(company, "微观博易");
});

test("parseTitleJob: 空标题安全", () => {
  const result = JH.parseTitleJob("");
  assert.equal(result.position, "");
  assert.equal(result.company, "");
});

test("classifyPage: 三种页面", () => {
  assert.equal(JH.classifyPage("https://www.zhipin.com/job_detail/abc.html?ka=1", "「量化研究实习生（北京）招聘」_微观博易招聘-BOSS直聘"), "job_detail");
  assert.equal(JH.classifyPage("https://www.zhipin.com/web/geek/chat?ka=header-message", "BOSS直聘"), "chat");
  assert.equal(JH.classifyPage("https://www.zhipin.com/beijing/", "BOSS直聘-找工作"), "other");
});

test("isToolbarText: 过滤工具条提示", () => {
  assert.equal(JH.isToolbarText("发简历 换电话 换微信 按Enter键发送"), true);
  assert.equal(JH.isToolbarText("你好，对这个岗位有兴趣吗？"), false);
});

test("suggestVersion: 职位命中量化岗版", () => {
  const versions = [
    { id: "v-quant", name: "量化岗版", targetRole: "量化研究员", jobIntentPositions: "量化研究 量化开发" },
    { id: "v-visual", name: "视觉算法岗版", targetRole: "视觉算法工程师", jobIntentPositions: "视觉算法" },
  ];
  const result = JH.suggestVersion("量化研究实习生（兼职/远程）", versions);
  assert.equal(result.versionId, "v-quant");
  assert.match(result.reason, /量化研究|量化/);
});

test("suggestVersion: 无命中返回占位", () => {
  const result = JH.suggestVersion("数据分析实习生", [
    { id: "v-quant", name: "量化岗版", targetRole: "量化研究员", jobIntentPositions: "量化研究" },
  ]);
  assert.equal(result.versionId, undefined);
  assert.match(result.reason, /手动选择/);
});

test("buildVersionDigest: 含求职意向与素材要点", () => {
  const version = {
    id: "v1",
    targetRole: "量化研究员",
    jobIntent: { positions: "量化研究", city: "北京", expectSalary: "面议", availability: "随时到岗", tags: "Python" },
    blocks: [
      { materialId: "m-edu", order: 1 },
      { materialId: "m-proj", order: 2 },
    ],
  };
  const materials = [
    { id: "m-edu", category: "education", title: "某某大学", subtitle: "金融工程 硕士", content: ["主修课程：随机过程"] },
    { id: "m-proj", category: "project", title: "A股多因子", subtitle: "", content: ["因子 IC 分析", "分层回测"] },
  ];
  const digest = JH.buildVersionDigest(version, materials);
  assert.match(digest, /【求职意向】/);
  assert.match(digest, /目标岗位：量化研究/);
  assert.match(digest, /【教育背景】/);
  assert.match(digest, /# A股多因子/);
  assert.match(digest, /· 分层回测/);
  assert.ok(digest.length <= 6000);
});

test("isMaskedCompany: 识别脱敏公司名", () => {
  assert.equal(JH.isMaskedCompany("某基金公司"), true);
  assert.equal(JH.isMaskedCompany("微观博易"), false);
});

test("norm/cut: 工具函数", () => {
  assert.equal(JH.norm("  a   b\n c "), "a b c");
  assert.equal(JH.cut("123456", 3), "123");
});
