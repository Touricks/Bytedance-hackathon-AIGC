import { generateScriptWithSeed } from "@aigc-video/ai";
import type { CreateCreativeBlueprintRequest } from "@aigc-video/shared";
import { db } from "../../db/client.js";
import { appendTrace } from "../../common/trace.js";

export async function processScriptGeneration(
  jobId: string,
  input: CreateCreativeBlueprintRequest
) {
  const current = await db.getJob(jobId);
  await db.updateJob(jobId, {
    ...appendTrace(current, "script_generating", "Started script generation"),
    status: "running",
    stage: "script_generating",
    progress: 25
  });

  const generated = await generateScriptWithSeed(input);
  const script = await db.createScript({
    jobId,
    productId: current.productId,
    version: 1,
    narrative: generated.narrative,
    visualStyle: generated.visualStyle,
    frozen: false,
    rawJson: generated
  });

  const shots = await db.createShots(
    script.id,
    generated.shots.map((shot) => ({
      index: shot.index,
      durationSec: shot.durationSec,
      visualPrompt: shot.visualPrompt,
      cameraMotion: shot.cameraMotion,
      voiceover: shot.voiceover,
      subtitle: shot.subtitle,
      status: "ready"
    }))
  );

  const afterScript = await db.getJob(jobId);
  await db.updateJob(jobId, {
    ...appendTrace(afterScript, "script_generating", "Script generated", {
      shotCount: shots.length
    }),
    scriptId: script.id,
    progress: 50
  });

  return { script, shots, generated };
}
