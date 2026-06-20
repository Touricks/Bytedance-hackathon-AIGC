export function runtimeMode() {
  return process.env.MODEL_MODE === "real" ? "real" : "mock";
}

export function promptViewProvider(): "ark" | "deterministic" {
  return runtimeMode() === "real" ? "ark" : "deterministic";
}

export function promptViewModel() {
  return runtimeMode() === "real"
    ? process.env.TEXT_ENDPOINT_ID ??
        process.env.AI_TEXT_ENDPOINT_ID ??
        process.env.ARK_TEXT_ENDPOINT_ID
    : undefined;
}
