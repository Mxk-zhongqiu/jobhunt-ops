import { AIWorkspace } from "../components/ai/AIWorkspace";
import { useAppData } from "../store/appStore";

export function AIPage() {
  const state = useAppData();
  return (
    <div className="page">
      <AIWorkspace state={state} />
    </div>
  );
}
