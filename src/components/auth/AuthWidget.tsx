import { useState, type FormEvent } from "react";
import { createPortal } from "react-dom";
import { CloudOff, LogIn, LogOut, UploadCloud } from "lucide-react";
import { mapAuthError } from "../../services/firebase";
import { useAppData } from "../../store/appStore";

/** 顶栏账号组件：未登录 → 登录/注册弹窗；已登录 → 邮箱 + 同步状态 + 退出（含首次上传本机数据） */
export function AuthWidget() {
  const { user, syncStatus, cloudEmpty, login, register, logout, uploadLocalToCloud } = useAppData();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  // 展示版 / 未配置云端：不提供登录入口
  if (syncStatus === "unsupported") {
    return (
      <span className="auth-chip" title="公网展示版或未配置 Firebase，数据仅保存在本机浏览器">
        <CloudOff size={13} /> 无云同步
      </span>
    );
  }

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      if (mode === "login") await login(email.trim(), password);
      else await register(email.trim(), password);
      setOpen(false);
      setPassword("");
    } catch (caught) {
      setError(mapAuthError(caught));
    } finally {
      setBusy(false);
    }
  };

  const handleLogout = async () => {
    await logout();
    setOpen(false);
  };

  const statusLabel =
    syncStatus === "syncing" ? "同步中…" : syncStatus === "error" ? "同步异常" : cloudEmpty ? "云端待上传" : "已云端同步";

  return (
    <div className="auth-widget">
      {user ? (
        <div className="auth-user">
          <span className="auth-email" title={user.email}>{user.email}</span>
          <span className={`provider-status ${syncStatus === "synced" ? "ok" : "no"}`}>{statusLabel}</span>
          {cloudEmpty ? (
            <button
              type="button"
              className="soft small"
              onClick={() => {
                if (window.confirm("把本机当前数据上传到云端，开始跨设备同步？上传后手机/电脑登录同一账号即可互通。")) {
                  void uploadLocalToCloud();
                }
              }}
            >
              <UploadCloud size={14} /> 上传本机数据
            </button>
          ) : null}
          <button type="button" className="soft small" onClick={handleLogout}><LogOut size={14} /> 退出</button>
        </div>
      ) : (
        <button type="button" className="soft small" onClick={() => setOpen(true)}><LogIn size={14} /> 登录 / 注册</button>
      )}

      {/* Portal 渲染到 body：顶栏的 backdrop-filter 会劫持 fixed 定位的包含块，
          不 portal 的话遮罩只会盖住顶栏区域、弹窗无法居中（桌面/手机同样问题） */}
      {open ? createPortal(
        <div className="auth-overlay" onClick={() => setOpen(false)}>
          <form className="auth-card" onClick={(event) => event.stopPropagation()} onSubmit={submit}>
            <h3>{mode === "login" ? "登录" : "注册账号"}</h3>
            <p className="auth-hint">登录后数据自动与云端同步，多设备互通；本地数据仍会保留。</p>
            <label>邮箱
              <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required autoComplete="email" placeholder="you@example.com" />
            </label>
            <label>密码
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
                minLength={6}
                autoComplete={mode === "login" ? "current-password" : "new-password"}
                placeholder="至少 6 位"
              />
            </label>
            {error ? <p className="auth-error">{error}</p> : null}
            <div className="auth-actions">
              <button type="button" className="link-btn" onClick={() => { setMode(mode === "login" ? "register" : "login"); setError(""); }}>
                {mode === "login" ? "没有账号？去注册" : "已有账号？去登录"}
              </button>
              <button type="submit" className="primary" disabled={busy}>{busy ? "处理中…" : mode === "login" ? "登录" : "注册并登录"}</button>
            </div>
          </form>
        </div>,
        document.body,
      ) : null}
    </div>
  );
}
