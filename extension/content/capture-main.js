// 求职作战台 · 站内 JSON 接口旁听（MAIN world，方案 A 探测版 v2）
// 在页面主世界挂载 fetch/XHR 监听：命中职位类的 JSON 响应原文（≤3 条，内存）经
// CustomEvent('__jh_capture__') 转发给隔离世界；计数与状态经 '__jh_ready__' 上报供诊断。
// 不做解密、不落盘、不改变页面行为。
(() => {
  "use strict";
  if (window.__jhCaptureMainInstalled__) return;
  window.__jhCaptureMainInstalled__ = true;

  const MAX_RAW = 300000; // 单条响应保留上限（字符）
  const MAX_ENTRIES = 3;
  const URL_HINT = /job|position|geek|detail|search|recommend|wapi|zpgeek|friend|gc/i;

  const cache = [];
  const stats = { fetch: 0, xhr: 0, captured: 0, lastFilter: "none", lastUrl: "" };

  function emitReady() {
    try {
      window.dispatchEvent(new CustomEvent("__jh_ready__", { detail: { stats: { ...stats } } }));
    } catch (_) {
      /* 忽略 */
    }
  }
  function emitCapture(url, raw) {
    try {
      window.dispatchEvent(new CustomEvent("__jh_capture__", { detail: { url, raw } }));
    } catch (_) {
      /* 忽略 */
    }
  }

  function capture(url, text) {
    try {
      if (!URL_HINT.test(url)) {
        stats.lastFilter = "url";
        return;
      }
      if (!text || text.length < 120) {
        stats.lastFilter = "size";
        return;
      }
      const head = text.slice(0, 4000).trim();
      if (!(head.startsWith("{") || head.startsWith("["))) {
        stats.lastFilter = "not-json";
        return;
      }
      cache.push({ url, raw: text.slice(0, MAX_RAW) });
      while (cache.length > MAX_ENTRIES) cache.shift();
      stats.captured += 1;
      stats.lastUrl = url.slice(0, 200);
      stats.lastFilter = "captured";
      emitCapture(url, cache[cache.length - 1].raw);
      emitReady();
    } catch (_) {
      /* 忽略 */
    }
  }

  // fetch 旁听
  const originalFetch = window.fetch.bind(window);
  window.fetch = (input, init) => {
    const url = typeof input === "string" ? input : input && input.url ? input.url : "";
    stats.fetch += 1;
    const promise = originalFetch(input, init);
    if (url) {
      promise
        .then((response) => {
          if (response && response.ok) {
            response
              .clone()
              .text()
              .then((text) => capture(url, text))
              .catch(() => {});
          }
        })
        .catch(() => {});
    }
    return promise;
  };

  // XHR 旁听
  const originalOpen = XMLHttpRequest.prototype.open;
  const originalSend = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function open(method, url) {
    try {
      this.__jhUrl = String(url || "");
    } catch (_) {
      /* 忽略 */
    }
    return originalOpen.apply(this, arguments);
  };
  XMLHttpRequest.prototype.send = function send() {
    try {
      stats.xhr += 1;
      this.addEventListener("load", () => {
        try {
          const url = this.__jhUrl || "";
          const text = typeof this.responseText === "string" ? this.responseText : "";
          capture(url, text);
        } catch (_) {
          /* 忽略 */
        }
      });
    } catch (_) {
      /* 忽略 */
    }
    return originalSend.apply(this, arguments);
  };

  // 诊断就绪信号：脚本就位后立即上报，页面 load 后再补一次（含期间发生的请求计数）
  emitReady();
  window.addEventListener("load", () => {
    setTimeout(emitReady, 1500);
  });
})();
