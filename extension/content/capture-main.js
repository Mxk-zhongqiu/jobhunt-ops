// 求职作战台 · 站内 JSON 接口旁听（MAIN world，方案 A 探测版）
// 只在页面主世界挂载 fetch/XHR 监听：把与职位相关的 JSON 响应原文（≤3 条，内存）通过
// CustomEvent('__jh_capture__') 转发给隔离世界（extract.js），用于探测候选接口与字段；
// 不做任何解密、不落盘、不改变页面行为。
(() => {
  "use strict";
  if (window.__jhCaptureMainInstalled__) return;
  window.__jhCaptureMainInstalled__ = true;

  const MAX_RAW = 300000; // 单条响应保留上限（字符）
  const MAX_ENTRIES = 3;
  const URL_HINT = /job|position|geek|detail|search|recommend|wapi/i;
  const TEXT_HINT = /职位|描述|岗位|jd|技能|标签|tag/i;

  const cache = [];

  function emit(url, raw) {
    try {
      window.dispatchEvent(new CustomEvent("__jh_capture__", { detail: { url, raw } }));
    } catch (_) {
      /* 忽略 */
    }
  }

  function capture(url, text) {
    try {
      if (!URL_HINT.test(url)) return;
      if (!text || text.length < 200) return;
      const head = text.slice(0, 4000).trim();
      if (!(head.startsWith("{") || head.startsWith("["))) return;
      if (!TEXT_HINT.test(text.slice(0, 60000))) return;
      cache.push({ url, raw: text.slice(0, MAX_RAW) });
      while (cache.length > MAX_ENTRIES) cache.shift();
      emit(url, cache[cache.length - 1].raw);
    } catch (_) {
      /* 忽略 */
    }
  }

  // fetch 旁听
  const originalFetch = window.fetch.bind(window);
  window.fetch = (input, init) => {
    const url = typeof input === "string" ? input : input && input.url ? input.url : "";
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
      this.addEventListener("load", () => {
        try {
          const url = this.__jhUrl || "";
          if (URL_HINT.test(url)) {
            const text = typeof this.responseText === "string" ? this.responseText : "";
            capture(url, text);
          }
        } catch (_) {
          /* 忽略 */
        }
      });
    } catch (_) {
      /* 忽略 */
    }
    return originalSend.apply(this, arguments);
  };
})();
