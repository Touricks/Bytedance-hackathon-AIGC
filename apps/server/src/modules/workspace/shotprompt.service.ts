import { nanoid } from "nanoid";
import { generateShotPromptWithArk } from "@aigc-video/ai";
import {
  assertShotPromptMatchesStoryboard,
  compileShotPrompt as compileShotPromptArtifact,
  materialIntakeArtifactSchema,
  productBriefArtifactSchema,
  shotPromptArtifactSchema,
  type ShotPromptArtifact,
  type StoryboardArtifact,
  storyboardArtifactSchema,
  validateP0StoryboardScript,
} from "@aigc-video/shared";
import { HttpError, NotFoundError } from "../../common/errors.js";
import { db } from "../../db/client.js";
import { createWorkspaceTraceAppendLogger } from "../trace/trace.service.js";
import { workspaceModuleRunService } from "./workspace-module-run.service.js";
import { runtimeMode } from "./workspace-runtime.js";

type ModuleArtifactStatus = "proposed" | "approved" | "archived" | "failed";

export interface ShotPromptModuleArtifact {
  id: string;
  workspaceId: string;
  moduleId: "shotprompt";
  status: ModuleArtifactStatus;
  isCurrent: boolean;
  data: unknown;
  sourceFingerprint: Record<string, unknown>;
  promptAssembly: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  approvedAt: string | null;
}

function toIsoString(value: unknown): string {
  return value instanceof Date ? value.toISOString() : String(value);
}

function jsonbParam(value: unknown) {
  return JSON.stringify(value ?? {});
}

function toShotPromptArtifact(
  row: Record<string, unknown>,
): ShotPromptModuleArtifact {
  return {
    id: String(row.id),
    workspaceId: String(row.workspace_id),
    moduleId: "shotprompt",
    status: row.status as ModuleArtifactStatus,
    isCurrent: Boolean(row.is_current),
    data: row.data,
    sourceFingerprint:
      row.source_fingerprint && typeof row.source_fingerprint === "object"
        ? (row.source_fingerprint as Record<string, unknown>)
        : {},
    promptAssembly:
      row.prompt_assembly && typeof row.prompt_assembly === "object"
        ? (row.prompt_assembly as Record<string, unknown>)
        : {},
    createdAt: toIsoString(row.created_at),
    updatedAt: toIsoString(row.updated_at),
    approvedAt: row.approved_at ? toIsoString(row.approved_at) : null,
  };
}

async function currentArtifact(input: {
  workspaceId: string;
  table:
    | "prompt_requirements_artifacts"
    | "material_intake_artifacts"
    | "product_brief_artifacts"
    | "storyboard_artifacts";
  label: string;
}) {
  const result = await db.db2.pool().query(
    `select *
     from ${input.table}
     where workspace_id = $1
       and status = 'approved'
       and is_current = true
     order by approved_at desc, created_at desc, id desc
     limit 1`,
    [input.workspaceId],
  );
  const row = result.rows[0];
  if (!row) {
    throw new HttpError(
      400,
      "NO_CURRENT_APPROVED_ARTIFACT",
      `${input.label} is required`,
    );
  }
  return { id: String(row.id), data: row.data };
}

async function currentSources(workspaceId: string) {
  const [requirements, materialIntake, productBrief, storyboard] =
    await Promise.all([
      currentArtifact({
        workspaceId,
        table: "prompt_requirements_artifacts",
        label: "Current approved prompt requirements",
      }),
      currentArtifact({
        workspaceId,
        table: "material_intake_artifacts",
        label: "Current approved material intake",
      }),
      currentArtifact({
        workspaceId,
        table: "product_brief_artifacts",
        label: "Current approved product brief",
      }),
      currentArtifact({
        workspaceId,
        table: "storyboard_artifacts",
        label: "Current approved storyboard",
      }),
    ]);
  return { requirements, materialIntake, productBrief, storyboard };
}

async function getArtifactForWorkspace(workspaceId: string, artifactId: string) {
  const result = await db.db2.pool().query(
    `select *
     from shot_prompt_artifacts
     where workspace_id = $1 and id = $2
     limit 1`,
    [workspaceId, artifactId],
  );
  const row = result.rows[0];
  if (!row) {
    throw new NotFoundError("ShotPromptArtifact");
  }
  return toShotPromptArtifact(row);
}

function assertMatchesStoryboard(
  data: ShotPromptArtifact,
  storyboard: StoryboardArtifact,
) {
  try {
    assertShotPromptMatchesStoryboard(data, storyboard);
  } catch (error) {
    throw new HttpError(
      400,
      "INVALID_SHOTPROMPT",
      error instanceof Error ? error.message : "Shotprompt does not match current storyboard",
    );
  }
}

function assertP0StoryboardBoundary(storyboard: StoryboardArtifact) {
  const result = validateP0StoryboardScript(storyboard);
  if (result.valid) return;
  throw new HttpError(
    400,
    "UPSTREAM_STORYBOARD_NOT_P0",
    `当前生效的分镜脚本不是三镜版本，请先批准三镜分镜脚本，再生成分镜生成要求。${result.issues
      .map((issue) => issue.message)
      .join(" ")}`,
  );
}

function enrichShotPrompt(rawData: unknown, storyboard: StoryboardArtifact) {
  const data = shotPromptArtifactSchema.parse(rawData);
  assertMatchesStoryboard(data, storyboard);
  const rawShots = Array.isArray((rawData as { shots?: unknown })?.shots)
    ? ((rawData as { shots: Array<Record<string, unknown>> }).shots)
    : [];
  return {
    ...data,
    shots: data.shots.map((shot, position, shots) => {
      const nextShot = shots[position + 1];
      const rawShot = rawShots[position] ?? {};
      return {
        ...shot,
        shotImage:
          rawShot.shotImage ?? {
            scene: `静态关键帧场景：围绕本镜头目标呈现商品与环境，语境参考为「${shot.providerPrompt}」。`,
            composition: `Shot ${position + 1} composition for ${data.aspectRatio}`,
            lighting: "保持真实电商短视频场景光线，主体清晰稳定。",
            productVisibility: shot.referenceAssetRefs.join(", "),
            referenceUsage: `使用 ${shot.referenceAssetRefs.join(", ")} 保持商品身份和画面语境。`,
            style: "consistent ecommerce product visual identity",
            negative: [],
          },
        shotVideo:
          rawShot.shotVideo ?? {
            cameraMotion: "smooth controlled ecommerce camera movement",
            subjectMotion:
              "controlled product-first motion that animates the approved key frame without changing product identity",
            firstFrameIntent: `begin from the approved static key frame for shot ${position + 1}`,
            lastFrameIntent: nextShot
              ? `move toward the next shot context without copying its still-image prompt: ${nextShot.providerPrompt.slice(0, 120)}`
              : null,
            durationIntent: `${Math.max(1, shot.endSec - shot.startSec)} 秒内完成本镜头目标。`,
            continuity:
              position === 0
                ? "establish product identity for following shots"
                : "preserve identity and motion continuity from previous shot",
            negative: [],
          },
      };
    }),
  };
}

function promptAssembly(input: {
  requirementArtifactId: string;
  data: unknown;
}) {
  return {
    moduleId: "shotprompt",
    requirementArtifactId: input.requirementArtifactId,
    preview:
      typeof input.data === "object" && input.data
        ? Object.keys(input.data).slice(0, 5).join(", ")
        : "",
  };
}

function upstreamChange(input: {
  artifact: ShotPromptModuleArtifact | null;
  promptRequirementsArtifactId: string | null;
  materialIntakeArtifactId: string | null;
  productBriefArtifactId: string | null;
  storyboardArtifactId: string | null;
}) {
  if (
    !input.artifact ||
    !input.promptRequirementsArtifactId ||
    !input.materialIntakeArtifactId ||
    !input.productBriefArtifactId ||
    !input.storyboardArtifactId
  ) {
    return { upstreamChanged: false, changedSources: [] };
  }

  const changedSources = [];
  if (
    input.artifact.sourceFingerprint.promptRequirementsArtifactId !==
    input.promptRequirementsArtifactId
  ) {
    changedSources.push("promptRequirementsArtifactId");
  }
  if (
    input.artifact.sourceFingerprint.materialIntakeArtifactId !==
    input.materialIntakeArtifactId
  ) {
    changedSources.push("materialIntakeArtifactId");
  }
  if (
    input.artifact.sourceFingerprint.productBriefArtifactId !==
    input.productBriefArtifactId
  ) {
    changedSources.push("productBriefArtifactId");
  }
  if (
    input.artifact.sourceFingerprint.storyboardArtifactId !==
    input.storyboardArtifactId
  ) {
    changedSources.push("storyboardArtifactId");
  }

  return {
    upstreamChanged: changedSources.length > 0,
    changedSources,
  };
}

export const shotPromptService = {
  async propose(input: {
    workspaceId: string;
    aspectRatio?: "9:16" | "16:9" | "1:1";
  }) {
    const workspace = await db.getWorkspace(input.workspaceId);
    const sources = await currentSources(input.workspaceId);
    const brief = productBriefArtifactSchema.parse(sources.productBrief.data);
    const material = materialIntakeArtifactSchema.parse(
      sources.materialIntake.data,
    );
    const storyboard = storyboardArtifactSchema.parse(sources.storyboard.data);
    assertP0StoryboardBoundary(storyboard);
    const aspectRatio = input.aspectRatio ?? "9:16";
    const sourceFingerprint = {
      promptRequirementsArtifactId: sources.requirements.id,
      materialIntakeArtifactId: sources.materialIntake.id,
      productBriefArtifactId: sources.productBrief.id,
      storyboardArtifactId: sources.storyboard.id,
    };
    const mode = runtimeMode();
    return workspaceModuleRunService.withRun({
      workspaceId: input.workspaceId,
      moduleId: "shotprompt",
      operation: "propose",
      runtimeBuilder: "shotprompt",
      provider: mode === "real" ? "ark" : "deterministic",
      sourceFingerprint,
      artifactId: (artifact) => artifact.id,
      run: async () => {
        const data = enrichShotPrompt(
          mode === "real"
            ? (
                await generateShotPromptWithArk(
                  {
                    brief,
                    material,
                    storyboard,
                    aspectRatio,
                    creativeRequirements: sources.requirements.data,
                  },
                  {
                    traceLogger: createWorkspaceTraceAppendLogger(workspace),
                  },
                )
              ).shotPrompt
            : compileShotPromptArtifact(storyboard, { aspectRatio }),
          storyboard,
        );
        const result = await db.db2.pool().query(
          `insert into shot_prompt_artifacts
             (id, workspace_id, status, is_current, data, source_fingerprint, prompt_assembly)
           values ($1, $2, 'proposed', false, $3, $4, $5)
           returning *`,
          [
            nanoid(),
            input.workspaceId,
            jsonbParam(data),
            jsonbParam(sourceFingerprint),
            jsonbParam(
              promptAssembly({
                requirementArtifactId: sources.requirements.id,
                data,
              }),
            ),
          ],
        );
        await db.updateWorkspace(input.workspaceId, {
          status: "shotprompt_proposed",
        });
        return toShotPromptArtifact(result.rows[0]);
      },
    });
  },

  async approve(input: {
    workspaceId: string;
    artifactId?: string;
    data?: unknown;
  }) {
    await db.getWorkspace(input.workspaceId);
    if (!input.artifactId && input.data === undefined) {
      throw new HttpError(400, "ARTIFACT_DATA_REQUIRED", "artifactId or data is required");
    }

    const sources = await currentSources(input.workspaceId);
    const storyboard = storyboardArtifactSchema.parse(sources.storyboard.data);
    assertP0StoryboardBoundary(storyboard);
    const source = input.artifactId
      ? await getArtifactForWorkspace(input.workspaceId, input.artifactId)
      : null;
    const data = enrichShotPrompt(input.data ?? source?.data, storyboard);
    const sourceFingerprint = source?.sourceFingerprint ?? {
      promptRequirementsArtifactId: sources.requirements.id,
      materialIntakeArtifactId: sources.materialIntake.id,
      productBriefArtifactId: sources.productBrief.id,
      storyboardArtifactId: sources.storyboard.id,
    };
    const assembly =
      source?.promptAssembly && Object.keys(source.promptAssembly).length > 0
        ? source.promptAssembly
        : promptAssembly({
            requirementArtifactId: sources.requirements.id,
            data,
          });

    const client = await db.db2.pool().connect();
    try {
      await client.query("begin");
      await client.query(
        `update shot_prompt_artifacts
         set is_current = false,
             updated_at = now()
         where workspace_id = $1
           and status = 'approved'
           and is_current = true`,
        [input.workspaceId],
      );
      const result = await client.query(
        `insert into shot_prompt_artifacts
           (id, workspace_id, status, is_current, data, source_fingerprint, prompt_assembly, approved_at)
         values ($1, $2, 'approved', true, $3, $4, $5, now())
         returning *`,
        [
          nanoid(),
          input.workspaceId,
          jsonbParam(data),
          jsonbParam(sourceFingerprint),
          jsonbParam(assembly),
        ],
      );
      await client.query(
        `update creative_workspace
         set status = 'shotprompt_approved',
             updated_at = now(),
             last_seen_at = now()
         where id = $1`,
        [input.workspaceId],
      );
      await client.query("commit");
      return toShotPromptArtifact(result.rows[0]);
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
  },

  async getState(workspaceId: string) {
    await db.getWorkspace(workspaceId);
    let promptRequirementsArtifactId: string | null = null;
    let materialIntakeArtifactId: string | null = null;
    let productBriefArtifactId: string | null = null;
    let storyboardArtifactId: string | null = null;
    try {
      const sources = await currentSources(workspaceId);
      promptRequirementsArtifactId = sources.requirements.id;
      materialIntakeArtifactId = sources.materialIntake.id;
      productBriefArtifactId = sources.productBrief.id;
      storyboardArtifactId = sources.storyboard.id;
    } catch (error) {
      if (!(error instanceof HttpError)) throw error;
    }

    const [proposedResult, currentResult] = await Promise.all([
      db.db2.pool().query(
        `select *
         from shot_prompt_artifacts
         where workspace_id = $1 and status = 'proposed'
         order by created_at desc, id desc
         limit 1`,
        [workspaceId],
      ),
      db.db2.pool().query(
        `select *
         from shot_prompt_artifacts
         where workspace_id = $1 and status = 'approved' and is_current = true
         order by approved_at desc, created_at desc, id desc
         limit 1`,
        [workspaceId],
      ),
    ]);
    const proposed = proposedResult.rows[0]
      ? toShotPromptArtifact(proposedResult.rows[0])
      : null;
    const current = currentResult.rows[0]
      ? toShotPromptArtifact(currentResult.rows[0])
      : null;

    return {
      moduleId: "shotprompt" as const,
      proposed,
      current,
      upstream: upstreamChange({
        artifact: current,
        promptRequirementsArtifactId,
        materialIntakeArtifactId,
        productBriefArtifactId,
        storyboardArtifactId,
      }),
    };
  },
};
