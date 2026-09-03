import { Outlet } from "react-router-dom";
import { AppShell } from "../components/layout/AppShell";
import { AppDataProvider } from "../store/appStore";
import { ResumeProvider } from "../store/resumeStore";

export function App() {
  return (
    <AppDataProvider>
      <ResumeProvider>
        <AppShell>
          <Outlet />
        </AppShell>
      </ResumeProvider>
    </AppDataProvider>
  );
}
