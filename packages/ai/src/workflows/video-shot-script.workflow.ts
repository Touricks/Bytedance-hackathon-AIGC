import { isRealProviderMode, resolveTextProviderConfig } from "../providers/provider-config.js";
import { VideoShotScriptOutputSchema, type VideoShotScriptOutput } from "../schemas/video-script.schema.js";
import { buildVideoShotScriptAgent, VIDEO_SHOT_SCRIPT_TEMPLATE_VERSION } from "../agents/video-shot-script.agent.js";
import { buildRunner, runAgent, type RunnerContext } from "../agents/runner.js";

export interface VideoScriptAgentInput {
  productBrief: unknown;
  shot: { index: number; objective: string; sceneDescription?: string };
  selectedImage: { id: string; summary: string; url: string };
  neighborImages: { prev?: { id: string; summary: string; url: string }; next?: { id: string; summary: string; url: string } };
  durationSec: number;
  userHint?: string;
}

export interface VideoScriptAgentResult {
  templateVersion: string;
  output: VideoShotScriptOutput;
}

export async function runVideoShotScriptAgent(input: {
  payload: VideoScriptAgentInput;
  context: RunnerContext;
}): Promise<VideoScriptAgentResult> {
  if (!isRealProviderMode()) {
    return {
      templateVersion: VIDEO_SHOT_SCRIPT_TEMPLATE_VERSION,
      output: VideoShotScriptOutputSchema.parse({
        durationSec: input.payload.durationSec,
        shotGoal: input.payload.shot.objective,
        startFrameDescription: "MOCK start: " + input.payload.shot.objective,
        endFrameDescription: "MOCK end frame",
        cameraMotion: "push_in",
        subjectMotion: "mock motion",
        productVisibility: "hero",
        sceneConsistency: "consistent mock lighting",
        providerPrompt: `MOCK video prompt for shot ${input.payload.shot.index} (${input.payload.durationSec}s push-in on hero product)`,
        riskNotes: [],
      }),
    };
  }
  const cfg = resolveTextProviderConfig();
  if (!cfg) throw new Error("TEXT provider not configured (TEXT_API_KEY / TEXT_ENDPOINT_ID)");
  const runner = buildRunner(cfg);
  const agent = buildVideoShotScriptAgent(cfg.endpointId);
  const output = await runAgent<VideoScriptAgentInput, VideoShotScriptOutput>({
    agent,
    input: input.payload,
    context: input.context,
    runner,
  });
  return {
    templateVersion: VIDEO_SHOT_SCRIPT_TEMPLATE_VERSION,
    output: VideoShotScriptOutputSchema.parse(output),
  };
}
