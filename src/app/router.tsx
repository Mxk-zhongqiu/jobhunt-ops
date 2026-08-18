import { createBrowserRouter } from "react-router-dom";
import { App } from "./App";
import { ApplicationsPage } from "../pages/ApplicationsPage";
import { InterviewsPage } from "../pages/InterviewsPage";
import { KnowledgePage } from "../pages/KnowledgePage";
import { OverviewPage } from "../pages/OverviewPage";
import { PlanPage } from "../pages/PlanPage";
import { ProjectsPage } from "../pages/ProjectsPage";

export const router = createBrowserRouter([
  {
    path: "/",
    element: <App />,
    children: [
      { index: true, element: <OverviewPage /> },
      { path: "applications", element: <ApplicationsPage /> },
      { path: "plan", element: <PlanPage /> },
      { path: "projects", element: <ProjectsPage /> },
      { path: "knowledge", element: <KnowledgePage /> },
      { path: "interviews", element: <InterviewsPage /> },
      { path: "*", element: <OverviewPage /> },
    ],
  },
]);
