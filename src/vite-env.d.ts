/// <reference types="vite/client" />

/** 构建期常量：公网展示版（vite build --mode demo，即 `npm run build:demo`）时为 true。
 *  由 vite.config.ts 的 define 静态替换，Rollup 据此摇掉未使用的种子分支。 */
declare const __DEMO_MODE__: boolean;
