import { useRef, useState, type ChangeEvent } from "react";
import { Download, FileJson, FileSpreadsheet, RefreshCcw, Upload } from "lucide-react";
import { createSeedState } from "../data/seed";
import { useAppData } from "../store/appStore";
import type { AppState } from "../types/domain";
import { applicationsToCsv, dateStamp, downloadText, isAppState } from "../utils/io";

export function DataPage() {
  const store = useAppData();
  const state: AppState = {
    applications: store.applications,
    interviews: store.interviews,
    weeklyPlans: store.weeklyPlans,
    projects: store.projects,
    knowledge: store.knowledge,
    settings: store.settings,
    questionBankMastered: store.questionBankMastered,
  };
  const { applications, restoreState } = store;
  const [pendingImport, setPendingImport] = useState<AppState | null>(null);
  const [message, setMessage] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const exportJson = () => {
    const size = Math.max(1, Math.round(new Blob([JSON.stringify(state)]).size / 1024));
    downloadText(`jobhunt-ops-backup-${dateStamp()}.json`, JSON.stringify(state, null, 2), "application/json");
    setMessage(`已导出完整备份（约 ${size} KB）。`);
  };

  const exportCsv = () => {
    downloadText(`jobhunt-ops-applications-${dateStamp()}.csv`, applicationsToCsv(applications), "text/csv;charset=utf-8");
    setMessage(`已导出投递清单 CSV（${applications.length} 家）。`);
  };

  const onPickFile = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed: unknown = JSON.parse(String(reader.result));
        if (!isAppState(parsed)) {
          setMessage("导入失败：文件不是本系统的备份格式。");
          setPendingImport(null);
          return;
        }
        setPendingImport(parsed);
        setMessage("");
      } catch {
        setMessage("导入失败：无法解析该 JSON 文件。");
        setPendingImport(null);
      }
    };
    reader.readAsText(file);
  };

  const confirmImport = () => {
    if (!pendingImport) return;
    if (!window.confirm(`导入将覆盖当前全部数据（当前 ${applications.length} 家投递）。确定继续？`)) return;
    restoreState(pendingImport);
    setPendingImport(null);
    setMessage(`导入完成：${pendingImport.applications.length} 家投递、${pendingImport.interviews.length} 条面试记录。`);
  };

  const resetToSeed = () => {
    if (!window.confirm("重置将丢弃全部现有数据并恢复种子清单。此操作不可撤销（建议先导出备份）。确定？")) return;
    restoreState(createSeedState());
    setMessage("已重置为种子数据。");
  };

  return (
    <div className="page">
      <section className="card">
        <div className="card-heading"><h2>导出备份</h2><span>数据保存在本机游客区 / 当前账号，并自动同步云端，建议定期导出</span></div>
        <div className="data-actions">
          <button type="button" className="primary" onClick={exportJson}><Download size={16} /> 导出完整备份（JSON）</button>
          <button type="button" className="soft" onClick={exportCsv}><FileSpreadsheet size={16} /> 导出投递清单（CSV）</button>
        </div>
        <p className="data-hint">JSON 备份包含全部数据（投递 / 面试 / 周计划 / 项目 / 知识 / 设置）；CSV 可导入 Excel 做漏斗分析。</p>
      </section>

      <section className="card">
        <div className="card-heading"><h2>导入备份</h2><span>覆盖当前数据</span></div>
        <div className="data-actions">
          <button type="button" className="soft" onClick={() => fileInputRef.current?.click()}><Upload size={16} /> 选择备份文件</button>
          <input ref={fileInputRef} type="file" accept=".json,application/json" style={{ display: "none" }} onChange={onPickFile} />
        </div>
        {pendingImport ? (
          <div className="import-preview">
            <p><strong>待导入内容：</strong>{pendingImport.applications.length} 家投递 · {pendingImport.interviews.length} 条面试记录 · {pendingImport.weeklyPlans.length} 周计划 · {pendingImport.projects.length} 个项目 · {pendingImport.knowledge.length} 个知识主题 · {(pendingImport.questionBankMastered ?? []).length} 个已掌握标记</p>
            <div className="data-actions">
              <button type="button" className="primary" onClick={confirmImport}><FileJson size={16} /> 确认导入（覆盖）</button>
              <button type="button" className="soft" onClick={() => setPendingImport(null)}>取消</button>
            </div>
          </div>
        ) : null}
      </section>

      <section className="card">
        <div className="card-heading"><h2>危险区</h2><span>恢复出厂</span></div>
        <div className="data-actions">
          <button type="button" className="danger" onClick={resetToSeed}><RefreshCcw size={16} /> 重置为种子数据</button>
        </div>
      </section>

      {message ? <p className="data-message">{message}</p> : null}
    </div>
  );
}
