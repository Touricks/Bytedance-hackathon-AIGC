import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  CREATIVE_ATTRIBUTION_SCHEMA_VERSION,
  creativeFactorRequirementsDataSchema,
  creativeAttributionSchema,
  finalVideoManifestSchema,
  type ComposeFinalVideoJobData,
} from "@aigc-video/shared";
import { db } from "../../db/client.js";
import { jobRepository } from "../job/job.repository.js";
import { traceService } from "../trace/trace.service.js";
import { getWorkspaceStorageAdapter } from "../workspace/storage/workspace-storage-resolver.js";
import { ffprobe, runFfmpeg } from "./ffmpeg.js";

function sha256(s: string) {
  return "sha256:" + createHash("sha256").update(s).digest("hex");
}

function parseCreativeFactors(data: unknown) {
  const parsed = creativeFactorRequirementsDataSchema.safeParse(data);
  return parsed.success ? parsed.data : null;
}

function creativeAttributionFromRequirements(input: {
  requirementsData: unknown;
  promptRequirementsArtifactId: string | null;
  shotPromptArtifactId: string | null;
}) {
  const parsed = parseCreativeFactors(input.requirementsData);
  return creativeAttributionSchema.parse({
    schemaVersion: CREATIVE_ATTRIBUTION_SCHEMA_VERSION,
    promptRequirementsArtifactId: input.promptRequirementsArtifactId,
    shotPromptArtifactId: input.shotPromptArtifactId,
    creativeFactors: parsed?.creativeFactors ?? null,
    factorPromptVersion: parsed?.factorPromptVersion ?? null,
  });
}

async function loadCreativeAttribution(input: {
  workspaceId: string;
  shotSetId: string | null;
}) {
  const sourceSnapshot = {
    schemaVersion: CREATIVE_ATTRIBUTION_SCHEMA_VERSION,
    promptRequirementsArtifactId: null as string | null,
    shotPromptArtifactId: null as string | null,
    creativeFactors: null,
    factorPromptVersion: null,
  };

  if (input.shotSetId) {
    const source = await db.db2.pool().query(
      `select ss.shot_prompt_artifact_id,
              sp.source_fingerprint->>'promptRequirementsArtifactId' as prompt_requirements_artifact_id
       from shot_sets ss
       join shot_prompt_artifacts sp on sp.id = ss.shot_prompt_artifact_id
       where ss.workspace_id = $1 and ss.id = $2
       limit 1`,
      [input.workspaceId, input.shotSetId],
    );
    const sourceRow = source.rows[0];
    const promptRequirementsArtifactId =
      typeof sourceRow?.prompt_requirements_artifact_id === "string"
        ? sourceRow.prompt_requirements_artifact_id
        : null;
    const shotPromptArtifactId =
      typeof sourceRow?.shot_prompt_artifact_id === "string"
        ? sourceRow.shot_prompt_artifact_id
        : null;

    if (promptRequirementsArtifactId) {
      const requirements = await db.db2.pool().query(
        `select data
         from prompt_requirements_artifacts
         where workspace_id = $1 and id = $2
         limit 1`,
        [input.workspaceId, promptRequirementsArtifactId],
      );
      const requirementsData = requirements.rows[0]?.data;
      return creativeAttributionFromRequirements({
        requirementsData,
        promptRequirementsArtifactId,
        shotPromptArtifactId,
      });
    }
    sourceSnapshot.shotPromptArtifactId = shotPromptArtifactId;
  }

  const current = await db.db2.pool().query(
    `select id, data
     from prompt_requirements_artifacts
     where workspace_id = $1 and status = 'approved' and is_current = true
     order by approved_at desc, created_at desc, id desc
     limit 1`,
    [input.workspaceId],
  );
  return creativeAttributionFromRequirements({
    requirementsData: current.rows[0]?.data,
    promptRequirementsArtifactId:
      typeof current.rows[0]?.id === "string" ? current.rows[0].id : null,
    shotPromptArtifactId: sourceSnapshot.shotPromptArtifactId,
  });
}

async function downloadTo(url: string, outPath: string) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`download failed ${res.status}: ${url}`);
  const buf = Buffer.from(await res.arrayBuffer());
  await writeFile(outPath, buf);
}

async function copyOrDownloadTo(input: {
  workspaceId: string;
  url: string;
  outPath: string;
}) {
  const workspaceVideoPrefix = `/api/workspaces/${input.workspaceId}/videos/`;
  if (input.url.startsWith(workspaceVideoPrefix)) {
    const relativeName = decodeURIComponent(input.url.slice(workspaceVideoPrefix.length));
    if (relativeName.startsWith("/") || relativeName.split(/[\\/]/).includes("..")) {
      throw new Error(`Invalid workspace video URL: ${input.url}`);
    }
    const adapter = await getWorkspaceStorageAdapter(input.workspaceId);
    await adapter.downloadToTemp(`videos/${relativeName}`, input.outPath);
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

  let workDir: string | null = null;
  try {
    const candidates = [];
    for (const id of job.sourceShotVideoIds) {
      const cand = await db.db2.getVideoCandidate(id);
      if (cand.status !== "SUCCEEDED" || !cand.videoUrl || !cand.objectKey) {
        throw new Error(`Video candidate ${id} is not ready for final compose`);
      }
      candidates.push(cand);
    }
    const workspaceStorage = await getWorkspaceStorageAdapter(job.workspaceId);

    workDir = await mkdtemp(path.join(tmpdir(), `daireel-final-${job.id}-`));
    const inputDir = path.join(workDir, "in");
    await mkdir(inputDir, { recursive: true });

    const inputs: string[] = [];
    for (let i = 0; i < candidates.length; i++) {
      const cand = candidates[i];
      if (!cand || cand.status !== "SUCCEEDED" || !cand.videoUrl || !cand.objectKey) {
        throw new Error(`Video candidate at index ${i} is not ready for final compose`);
      }
      const local = path.join(inputDir, `shot-${i + 1}.mp4`);
      await copyOrDownloadTo({
        workspaceId: job.workspaceId,
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
    const finalObjectKey = `final/${job.id}/final.mp4`;
    await workspaceStorage.putObject({
      relativePath: finalObjectKey,
      body: await readFile(outPath),
      contentType: "video/mp4",
    });
    const manifest = finalVideoManifestSchema.parse({
      schemaVersion: "final-video-manifest",
      workspaceId: job.workspaceId,
      creativeAttribution: await loadCreativeAttribution({
        workspaceId: job.workspaceId,
        shotSetId: job.shotSetId,
      }),
      sources: candidates.map((c) => ({
        shotId: c.shotId,
        videoCandidateId: c.id,
        providerUrl: c.videoUrl,
        providerPromptHash: sha256(JSON.stringify(c.providerResponse)),
      })),
      transition: "cut",
    });
    const manifestHash = sha256(JSON.stringify(manifest));

    await db.db2.updateFinalVideoJob(job.id, {
      status: "SUCCEEDED",
      localPath: finalObjectKey,
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
    await db.updateWorkspace(job.workspaceId, { status: "video_ready" });
    await traceService.record({
      workspaceId: job.workspaceId,
      traceType: "job_event",
      name: "final_compose_completed",
      metadata: { manifestHash },
    });
    await rm(workDir, { recursive: true, force: true }).catch(() => undefined);
    workDir = null;
  } catch (err) {
    if (workDir) {
      await rm(workDir, { recursive: true, force: true }).catch(() => undefined);
    }
    await db.db2.updateFinalVideoJob(job.id, {
      status: "FAILED",
      errorMessage: (err as Error).message,
    });
    await jobRepository.update(data.jobId, {
      status: "FAILED",
      completedAt: new Date().toISOString(),
      errorMessage: (err as Error).message,
    });
    await db.updateWorkspace(job.workspaceId, { status: "failed" });
    throw err;
  }
}
