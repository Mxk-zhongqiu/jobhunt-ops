import { useState } from "react";
import { useAppData } from "../../store/appStore";
import { useResumeData } from "../../store/resumeStore";

/**
 * 登录后出现"本机游客槽有未绑定数据"时的认领横幅（主数据与简历数据各自独立提示）。
 * 语义：游客槽数据只属于这台浏览器；并入 = 作为该账号数据上传云端；保留 = 留在游客区，绝不静默上传。
 */
export function SyncClaims() {
  const app = useAppData();
  const resume = useResumeData();
  const [busyApp, setBusyApp] = useState(false);
  const [busyResume, setBusyResume] = useState(false);

  if (app.previewDemo) return null; // 演示预览中不打扰
  const appClaim = app.pendingLocalClaim;
  const resumeClaim = resume.pendingLocalClaim;
  if (!appClaim && !resumeClaim) return null;

  const claimApp = async () => {
    setBusyApp(true);
    try {
      await app.claimLocalData();
    } finally {
      setBusyApp(false);
    }
  };
  const claimResume = async () => {
    setBusyResume(true);
    try {
      await resume.claimLocalData();
    } finally {
      setBusyResume(false);
    }
  };

  return (
    <div className="claim-stack">
      {appClaim ? (
        <div className="claim-banner" role="status">
          <div className="claim-text">
            本机有一份<b>未绑定账号</b>的主数据（{appClaim.applications.length} 家投递 · {appClaim.interviews.length} 条面试 ·{" "}
            {appClaim.projects.length} 个项目 · {appClaim.knowledge.length} 个知识主题），目前只存在这台浏览器。
            如果属于当前账号请<b>并入</b>，从此跟随账号云端同步；不确定就保留在游客区。
          </div>
          <div className="claim-actions">
            <button type="button" className="primary small" disabled={busyApp} onClick={() => void claimApp()}>
              {busyApp ? "并入中…" : "并入当前账号"}
            </button>
            <button type="button" className="soft small" disabled={busyApp} onClick={app.skipLocalClaim}>
              保留在游客区
            </button>
          </div>
        </div>
      ) : null}
      {resumeClaim ? (
        <div className="claim-banner" role="status">
          <div className="claim-text">
            本机有一份<b>未绑定账号</b>的简历数据（{resumeClaim.materials.length} 条素材 · {resumeClaim.versions.length} 个版本）。
            如果属于当前账号请<b>并入</b>；保留在游客区则不会上传到云端。
          </div>
          <div className="claim-actions">
            <button type="button" className="primary small" disabled={busyResume} onClick={() => void claimResume()}>
              {busyResume ? "并入中…" : "并入当前账号"}
            </button>
            <button type="button" className="soft small" disabled={busyResume} onClick={resume.skipLocalClaim}>
              保留在游客区
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
