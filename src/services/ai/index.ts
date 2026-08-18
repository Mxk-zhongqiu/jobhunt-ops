export { MockAdapter } from "./MockAdapter";
export { buildAIContextSummary } from "./context";
export { DeepSeekAdapter, getDeepSeekStatus } from "./DeepSeekAdapter";

import type { AppState } from "../../types/domain";
import type { AIProviderId } from "../../types/ai";
import { DeepSeekAdapter } from "./DeepSeekAdapter";
import { MockAdapter } from "./MockAdapter";

export function createAIService(provider: AIProviderId, state: AppState) {
  return provider === "deepseek" ? new DeepSeekAdapter(state) : new MockAdapter(state);
}
