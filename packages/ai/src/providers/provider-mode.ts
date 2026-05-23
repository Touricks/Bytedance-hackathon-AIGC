import { isRealProviderMode as resolveRealProviderMode } from "./provider-config.js";

export function isRealProviderMode() {
  return resolveRealProviderMode();
}
