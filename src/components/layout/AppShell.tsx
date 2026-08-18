import { BookOpen, Bot, CalendarCheck, FolderKanban, HardDriveDownload, LayoutDashboard, ListChecks, MessageSquareText, Send, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { AuthWidget } from "../auth/AuthWidget";
import { currentWeek, useAppData } from "../../store/appStore";

interface NavItem {
  path: string;
  label: string;
  icon: LucideIcon;
}

const navItems: NavItem[] = [
  { path: "/", label: "作战总览", icon: LayoutDashboard },
  { path: "/applications", label: "投递追踪", icon: Send },
  { path: "/plan", label: "周计划", icon: CalendarCheck },
  { path: "/projects", label: "项目", icon: FolderKanban },
  { path: "/knowledge", label: "知识", icon: BookOpen },
  { path: "/interviews", label: "面试记录", icon: MessageSquareText },
  { path: "/question-bank", label: "面试题库", icon: ListChecks },
  { path: "/ai", label: "AI 助手", icon: Bot },
  { path: "/data", label: "数据管理", icon: HardDriveDownload },
];

export function AppShell({ children }: { children: ReactNode }) {
  const { settings, user } = useAppData();
  const location = useLocation();
  const week = currentWeek(settings);
  const currentLabel = navItems.find((item) => item.path === location.pathname)?.label ?? "作战总览";

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="sidebar-header">
          <strong>求职作战台</strong>
          <span>2026 秋招</span>
        </div>
        <nav className="sidebar-nav">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink key={item.path} to={item.path} end={item.path === "/"} className={({ isActive }) => (isActive ? "active" : "")}>
                <Icon size={17} />
                <span>{item.label}</span>
              </NavLink>
            );
          })}
        </nav>
        <div className="sidebar-footer">
          <div className="week-chip">第 {week} 周</div>
          <span>{settings.targetName} · {user ? "已云端同步" : "本地模式"}</span>
        </div>
      </aside>
      <main className="main">
        <header className="topbar">
          <div>
            <h1>{currentLabel}</h1>
            <p>{new Date().toLocaleDateString("zh-CN", { year: "numeric", month: "long", day: "numeric", weekday: "long" })}</p>
          </div>
          <div className="topbar-right">
            <div className="topbar-target">总目标 {settings.totalTarget} 家 · 每日 {settings.dailySubmitTarget} 家</div>
            <AuthWidget />
          </div>
        </header>
        <div className="page-content">{children}</div>
      </main>
    </div>
  );
}
