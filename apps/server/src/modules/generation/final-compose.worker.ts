import { createHash } from "node:crypto";
import { copyFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { ComposeFinalVideoJobData } from "@aigc-video/shared";
import { db } from "../../db/client.js";
import { jobRepository } from "../job/job.repository.js";
import { traceService } from "../trace/trace.service.js";
import { resolveWorkspaceStorageLocalPath } from "../workspace/workspace.service.js";
import { ffprobe, runFfmpeg } from "./ffmpeg.js";

function sha256(s: string) {
  return "sha256:" + createHash("sha256").update(s).digest("hex");
}

async function downloadTo(url: string, outPath: string) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`download failed ${res.status}: ${url}`);
  const buf = Buffer.from(await res.arrayBuffer());
  await writeFile(outPath, buf);
}

async function copyOrDownloadTo(input: {
  workspaceId: string;
  workspaceLocalPath: string;
  url: string;
  outPath: string;
}) {
  const workspaceVideoPrefix = `/api/workspaces/${input.workspaceId}/videos/`;
  if (input.url.startsWith(workspaceVideoPrefix)) {
    const relativeName = decodeURIComponent(input.url.slice(workspaceVideoPrefix.length));
    const sourcePath = path.resolve(
      input.workspaceLocalPath,
      ".daireel",
      "videos",
      relativeName,
    );
    const videoRoot = path.resolve(input.workspaceLocalPath, ".daireel", "videos");
    if (!sourcePath.startsWith(videoRoot + path.sep)) {
      throw new Error(`Invalid workspace video URL: ${input.url}`);
    }
    await copyFile(sourcePath, input.outPath);
    return;
  }
  await downloadTo(input.url, input.outPath);
}

export async function processComposeFinalVideo(data: ComposeFinalVideoJobData) {
  const job = await db.db2.getFinalVideoJob(data.finalVideoJobId);
  if (job.status !== "PENDING") return;
  await db.db2.updateFinalVideoJob(job.id, { status: "RUNNING" });
  await jobRepository.update(data.jobId, {
    status: "RUNNING",
    startedAt: new Date().toISOString(),
  });

  try {
    const candidates = [];
    for (const id of job.sourceShotVideoIds) {
      const cand = await db.db2.getVideoCandidate(id);
      if (!cand.videoUrl) throw new Error(`Missing videoUrl on candidate ${id}`);
      candidates.push(cand);
    }
    // Order is already the persisted source_shot_video_ids order (set at creation time).
    const wsLocalPath = await resolveWorkspaceStorageLocalPath(job.workspaceId);

    const workDir = path.join(wsLocalPath, ".daireel", "final", job.id);
    const inputDir = path.join(workDir, "in");
    await mkdir(inputDir, { recursive: true });

    const inputs: string[] = [];
    for (let i = 0; i < candidates.length; i++) {
      const cand = candidates[i];
      if (!cand?.videoUrl) throw new Error(`Missing videoUrl on candidate index ${i}`);
      const local = path.join(inputDir, `shot-${i + 1}.mp4`);
      await copyOrDownloadTo({
        workspaceId: job.workspaceId,
        workspaceLocalPath: wsLocalPath,
        url: cand.videoUrl,
        outPath: local,
      });
      inputs.push(local);
    }
    const listFile = path.join(workDir, "concat.txt");
    await writeFile(
      listFile,
      inputs.map((p) => `file '${p.replace(/'/g, "'\\''")}'`).join("\n"),
    );

    const outPath = path.join(workDir, "final.mp4");
    const ffmpegLog = await runFfmpeg([
      "-f", "concat", "-safe", "0", "-i", listFile,
      "-c:v", "libx264", "-preset", "veryfast", "-crf", "20",
      "-c:a", "aac", "-b:a", "160k",
      "-movflags", "+faststart",
      "-y", outPath,
    ]);

    const meta = await ffprobe(outPath);
    const manifest = {
      schemaVersion: "final-video.v1",
      workspaceId: job.workspaceId,
      sources: candidates.map((c) => ({
        shotId: c.shotId,
        videoCandidateId: c.id,
        providerUrl: c.videoUrl,
        providerPromptHash: sha256(JSON.stringify(c.providerResponse)),
      })),
      transition: "cut",
    };
    const manifestHash = sha256(JSON.stringify(manifest));

    await db.db2.updateFinalVideoJob(job.id, {
      status: "SUCCEEDED",
      localPath: outPath,
      localUrl: `/api/workspaces/${job.workspaceId}/final-videos/${job.id}/file`,
      durationSec: meta.durationSec,
      width: meta.width,
      height: meta.height,
      compiledManifest: manifest,
      compiledManifestHash: manifestHash,
      ffmpegLog: ffmpegLog.slice(-2000),
      completedAt: new Date().toISOString(),
    });
    await jobRepository.update(data.jobId, {
      status: "SUCCEEDED",
      completedAt: new Date().toISOString(),
    });
    await traceService.record({
      workspaceId: job.workspaceId,
      traceType: "job_event",
      name: "final_compose_completed",
      metadata: { manifestHash },
    });
  } catch (err) {
    await db.db2.updateFinalVideoJob(job.id, {
      status: "FAILED",
      errorMessage: (err as Error).message,
    });
    await jobRepository.update(data.jobId, {
      status: "FAILED",
      completedAt: new Date().toISOString(),
      errorMessage: (err as Error).message,
    });
    throw err;
  }
}
