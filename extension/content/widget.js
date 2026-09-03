// 求职作战台 · 常驻悬浮面板（v0.3，content script 注入 BOSS/猎聘 页面）
// 形态：气泡 ↔ 抽屉面板（内嵌 popup.html iframe，复用全部功能）
// 交互：气泡可拖动；面板顶栏可拖动自由定位（位置按站点记忆）；「收起」「退出常驻」
// 常驻开关按站点记忆（jhWidgetEnabled:<host>）：开启后该站点页面整页刷新仍恢复气泡；
// 关闭常驻会通知其它同站标签页一并移除。不自动发送、不抢焦点；无“点击页面自动收起”。
(() => {
  "use strict";
  if (window.__jhWidgetInstalled__) return;
  window.__jhWidgetInstalled__ = true;

  const ENABLE_KEY = "jhWidgetEnabled:" + location.hostname;
  const POS_KEY = "jhWidgetPos:" + location.hostname;
  const HOST_ID = "__jhWidgetHost__";

  const STYLE = `
    :host { all: initial; }
    * { box-sizing: border-box; font-family: -apple-system, "Segoe UI", "Microsoft YaHei", sans-serif; }
    .jh-wrap {
      position: fixed; z-index: 2147483000;
      top: 90px; right: 16px; /* 兜底：显式 left/top 定位后 right 会被清除 */
    }
    .jh-bubble {
      width: 58px; height: 58px; border-radius: 50%;
      background: #2f6bff; color: #fff; border: none; cursor: grab;
      font-size: 13px; font-weight: 600; line-height: 1.15;
      display: flex; align-items: center; justify-content: center; text-align: center;
      box-shadow: 0 4px 14px rgba(31, 42, 55, 0.28); user-select: none;
    }
    .jh-bubble:hover { background: #2454d1; }
    .jh-bubble:active { cursor: grabbing; }
    .jh-panel {
      display: flex; flex-direction: column;
      width: 408px; background: #ffffff;
      border: 1px solid #dfe3e9; border-radius: 12px; overflow: hidden;
      box-shadow: 0 10px 34px rgba(20, 30, 50, 0.22);
    }
    .jh-bar {
      display: flex; align-items: center; gap: 8px; padding: 8px 10px;
      background: #f1f4f8; border-bottom: 1px solid #e6e9ef; cursor: grab; user-select: none;
    }
    .jh-bar:active { cursor: grabbing; }
    .jh-title { flex: 1; font-size: 13px; font-weight: 600; color: #1c2430; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
    .jh-btn {
      border: 1px solid #d4d9e0; background: #fff; color: #1c2430; border-radius: 6px;
      font-size: 12px; padding: 3px 8px; cursor: pointer;
    }
    .jh-btn:hover { background: #f7f9fb; }
    .jh-btn.danger:hover { border-color: #e2b6b1; color: #b3261e; }
    .jh-iframe { border: 0; display: block; width: 100%; height: 540px; }
    .jh-hidden { display: none !important; }
  `;

  let host = null; // 轻量 DOM 容器（light DOM），内含 shadow root
  let wrapEl = null; // 真正的 position:fixed 元素（定位都作用在它上面）
  let shadow = null;
  let bubbleEl = null;
  let panelEl = null;

  function readKey(key) {
    return chrome.storage.local.get(key).then((stored) => stored[key]);
  }
  function writeKey(key, value) {
    return chrome.storage.local.set({ [key]: value });
  }

  function currentMode() {
    if (!panelEl) return "bubble";
    return panelEl.classList.contains("jh-hidden") ? "bubble" : "panel";
  }
  function sizeFor(mode) {
    return mode === "panel" ? 408 : 58;
  }
  function clampPos(left, top, w, h) {
    const vw = document.documentElement.clientWidth || window.innerWidth;
    const vh = document.documentElement.clientHeight || window.innerHeight;
    const pad = 8;
    const maxLeft = Math.max(pad, vw - w - pad);
    const maxTop = Math.max(pad, vh - (h || 200) - pad);
    return { left: Math.min(Math.max(left, pad), maxLeft), top: Math.min(Math.max(top, pad), maxTop) };
  }

  function applyPosition(pos) {
    if (!wrapEl || !pos) return;
    wrapEl.style.right = "auto";
    wrapEl.style.left = `${pos.left}px`;
    wrapEl.style.top = `${pos.top}px`;
  }

  async function persistPosition() {
    if (!wrapEl) return;
    const rect = wrapEl.getBoundingClientRect();
    await writeKey(POS_KEY, { left: Math.round(rect.left), top: Math.round(rect.top) });
  }

  async function defaultPosition(mode) {
    const stored = await readKey(POS_KEY);
    const w = sizeFor(mode);
    const vw = document.documentElement.clientWidth || window.innerWidth;
    if (stored && typeof stored.left === "number" && typeof stored.top === "number") {
      return clampPos(stored.left, stored.top, w, mode === "panel" ? 560 : 58);
    }
    if (mode === "panel") return clampPos(vw - w - 16, 72, w, 560);
    return clampPos(vw - w - 24, 120, w, 58);
  }

  async function repositionFor(mode) {
    if (!wrapEl) return;
    const pos = await defaultPosition(mode);
    const w = sizeFor(mode);
    const h = mode === "panel" ? Math.max(200, Math.min(560, wrapEl.getBoundingClientRect().height || 560)) : 58;
    applyPosition(clampPos(pos.left, pos.top, w, h));
  }

  function showBubble() {
    if (!host) return;
    bubbleEl.classList.remove("jh-hidden");
    panelEl.classList.add("jh-hidden");
    repositionFor("bubble");
  }
  function showPanel() {
    if (!host) return;
    bubbleEl.classList.add("jh-hidden");
    panelEl.classList.remove("jh-hidden");
    repositionFor("panel");
  }

  function attachDrag(handle) {
    handle.addEventListener("pointerdown", (event) => {
      if (event.button !== 0) return;
      event.preventDefault();
      handle.setPointerCapture?.(event.pointerId);
      const startX = event.clientX;
      const startY = event.clientY;
      const rect = wrapEl.getBoundingClientRect();
      const originLeft = rect.left;
      const originTop = rect.top;
      let moved = false;
      const onMove = (moveEvent) => {
        const mode = currentMode();
        const w = sizeFor(mode);
        const h = mode === "panel" ? Math.max(200, wrapEl.getBoundingClientRect().height || 560) : 58;
        const clamped = clampPos(originLeft + moveEvent.clientX - startX, originTop + moveEvent.clientY - startY, w, h);
        applyPosition(clamped);
        moved = true;
      };
      const onUp = () => {
        handle.removeEventListener("pointermove", onMove);
        handle.removeEventListener("pointerup", onUp);
        handle.removeEventListener("pointercancel", onUp);
        if (moved) persistPosition();
      };
      handle.addEventListener("pointermove", onMove);
      handle.addEventListener("pointerup", onUp);
      handle.addEventListener("pointercancel", onUp);
    });
  }

  async function destroy() {
    if (host && host.parentNode) host.parentNode.removeChild(host);
    host = null;
    wrapEl = null;
    shadow = null;
    bubbleEl = null;
    panelEl = null;
  }

  async function buildWidget(openImmediately) {
    if (host) {
      if (openImmediately) showPanel();
      return host;
    }
    host = document.createElement("div");
    host.id = HOST_ID;
    shadow = host.attachShadow({ mode: "open" });
    const styleEl = document.createElement("style");
    styleEl.textContent = STYLE;
    const wrap = document.createElement("div");
    wrap.className = "jh-wrap";
    wrapEl = wrap;

    bubbleEl = document.createElement("button");
    bubbleEl.type = "button";
    bubbleEl.className = "jh-bubble";
    bubbleEl.textContent = "作战台";
    bubbleEl.title = "展开求职作战台";

    panelEl = document.createElement("div");
    panelEl.className = "jh-panel jh-hidden";
    const bar = document.createElement("div");
    bar.className = "jh-bar";
    const title = document.createElement("span");
    title.className = "jh-title";
    title.textContent = "求职作战台（拖动标题可移动）";
    const collapseBtn = document.createElement("button");
    collapseBtn.type = "button";
    collapseBtn.className = "jh-btn";
    collapseBtn.textContent = "收起";
    const exitBtn = document.createElement("button");
    exitBtn.type = "button";
    exitBtn.className = "jh-btn danger";
    exitBtn.textContent = "退出常驻";
    bar.append(title, collapseBtn, exitBtn);
    const iframe = document.createElement("iframe");
    iframe.className = "jh-iframe";
    iframe.src = chrome.runtime.getURL("popup.html");
    iframe.setAttribute("title", "求职作战台");
    panelEl.append(bar, iframe);

    bubbleEl.addEventListener("click", () => showPanel());
    collapseBtn.addEventListener("click", () => showBubble());
    exitBtn.addEventListener("click", () => disableAndDestroy());
    attachDrag(bubbleEl);
    attachDrag(bar);
    window.addEventListener("resize", () => repositionFor(currentMode()));

    wrap.append(bubbleEl, panelEl);
    shadow.append(styleEl, wrap);
    (document.body || document.documentElement).appendChild(host);

    const pos = await defaultPosition(openImmediately ? "panel" : "bubble");
    applyPosition(pos);
    if (openImmediately) showPanel();
    else showBubble();
    return host;
  }

  async function enableWidget() {
    await writeKey(ENABLE_KEY, true);
    await buildWidget(true);
  }

  async function disableAndDestroy() {
    await chrome.storage.local.remove(ENABLE_KEY);
    await destroy();
  }

  // 同站其它标签页联动：常驻被关闭则一并移除
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local" || !changes[ENABLE_KEY]) return;
    const next = changes[ENABLE_KEY].newValue;
    if (next === false) destroy();
    else if (next === true) buildWidget(false);
  });

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (!message) return;
    if (message.type === "jobhunt-widget-state") {
      readKey(ENABLE_KEY).then((enabled) => sendResponse({ ok: true, enabled: Boolean(enabled) }));
      return true;
    }
    if (message.type === "jobhunt-widget-enable") {
      enableWidget()
        .then(() => sendResponse({ ok: true, enabled: true }))
        .catch((err) => sendResponse({ ok: false, error: String(err && err.message ? err.message : err) }));
      return true;
    }
    if (message.type === "jobhunt-widget-disable") {
      disableAndDestroy()
        .then(() => sendResponse({ ok: true, enabled: false }))
        .catch((err) => sendResponse({ ok: false, error: String(err && err.message ? err.message : err) }));
      return true;
    }
    return undefined;
  });

  // 常驻已开启：页面加载/整页刷新后恢复为气泡（不自动展开，避免挡视线）
  readKey(ENABLE_KEY).then((enabled) => {
    if (enabled) buildWidget(false);
  });
})();
