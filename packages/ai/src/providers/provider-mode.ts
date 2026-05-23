import { loadWorkspaceEnv } from "../env.js";

loadWorkspaceEnv();

export function isRealProviderMode() {
  return process.env.MODEL_MODE === "real";
}
