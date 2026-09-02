// 求职作战台 · 插件 Firebase 公网配置模板
// 复制为同目录 config.js 并填写；也可在仓库根目录运行 `npm run ext:config` 从 .env 自动生成。
// 注意：config.js 已被 .gitignore 忽略（不入库）；本模板文件入库供参考。
// 这些是 Firebase Web 公网凭据（与网站生产构建中嵌入的一致），并非机密；真正的密钥只存在于服务端。
globalThis.EXT_CONFIG = {
  apiKey: "AIzaSy...", // VITE_FIREBASE_API_KEY
  authDomain: "jobhunt-ops.firebaseapp.com", // VITE_FIREBASE_AUTH_DOMAIN
  projectId: "jobhunt-ops", // VITE_FIREBASE_PROJECT_ID
};
