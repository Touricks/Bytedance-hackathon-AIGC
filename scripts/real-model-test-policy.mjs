export const backendSmokeCommand =
  "pnpm --filter @aigc-video/server test:integration:smoke";

export function disabledRealModelTestMessage(name) {
  return [
    `[disabled] ${name} is disabled.`,
    "Multi-real-model integration tests are closed.",
    `Run "${backendSmokeCommand}" for the backend image/video chain smoke tests.`
  ].join(" ");
}

export function exitDisabledRealModelTest(name) {
  console.log(disabledRealModelTestMessage(name));
  process.exit(0);
}
