import { Outlet } from "react-router-dom";
import { AppShell } from "../components/layout/AppShell";
import { AppDataProvider } from "../store/appStore";

export function App() {
  return (
    <AppDataProvider>
      <AppShell>
        <Outlet />
      </AppShell>
    </AppDataProvider>
  );
}
