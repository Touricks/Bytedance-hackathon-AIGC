import { nanoid } from "nanoid";
import {
  generateStoryboardWithArk,
  getModulePromptAssemblyMetadata,
  rewriteStoryboardVoiceoversWithArk,
} from "@aigc-video/ai";
import {
  materialIntakeArtifactSchema,
  productBriefArtifactSchema,
  storyboardScriptVoiceoverLimit,
  storyboardArtifactSchema,
  validateP0StoryboardScript,
  type ProductBriefArtifact,
  type StoryboardArtifact,
} from "@aigc-video/shared";
import { HttpError, NotFoundError } from "../../common/errors.js";
import { db } from "../../db/client.js";
import {
  createWorkspaceTraceLoggerForWorkspace,
  runtimeMode,
  toStoryboard,
  writeReviewSnapshotForWorkspace,
} from "./workspace.service.js";

type ModuleArtifactStatus = "proposed" | "approved" | "archived" | "failed";

export interface StoryboardModuleArtifact {
  id: string;
  workspaceId: string;
  moduleId: "storyboard";
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

const HARDCODED_BANNED_VOICEOVER_PHRASES = [
  "感兴趣的可以去看看哦",
  "喜欢的可以去看看哦",
  "喜欢的姐妹可以去看看哦",
  "喜欢的可以点一下",
  "心动不如行动",
  "手慢无",
  "快来了解",
  "点击下方",
  "赶紧入手",
  "链接在主页",
  "链接挂主页",
  "赶紧下单",
  "限时优惠",
  "还在等什么",
];

function assertNoGlobalBannedExpressions(
  data: StoryboardArtifact,
  bannedExpressions: string[],
) {
  const allBanned = [
    ...HARDCODED_BANNED_VOICEOVER_PHRASES,
    ...bannedExpressions,
  ];
  for (const shot of data.shots) {
    const found = allBanned.filter((phrase) => shot.voiceover.includes(phrase));
    if (found.length > 0) {
      throw new HttpError(
        400,
        "BANNED_VOICEOVER_EXPRESSION",
        `分镜 ${shot.index + 1} 口播含禁用词：${found.join("、")}。请重新生成。`,
      );
    }
  }
}

function assertValidP0StoryboardScript(data: StoryboardArtifact) {
  const result = validateP0StoryboardScript(data);
  if (!result.valid) {
    throw new HttpError(
      400,
      "INVALID_STORYBOARD_SCRIPT",
      result.issues.map((issue) => issue.message).join(" "),
    );
  }
}

function assertValidP0StoryboardStructure(data: StoryboardArtifact) {
  assertValidP0StoryboardScript({
    ...data,
    shots: data.shots.map((shot) => ({
      ...shot,
      voiceover: "口播",
    })),
  });
}

function clampEffectiveText(value: string, limit: number) {
  const characters = Array.from(value.replace(/\s+/g, ""));
  return characters.slice(0, Math.max(1, limit)).join("");
}

function mockVoiceoverRewrite(
  brief: ProductBriefArtifact,
  draft: StoryboardArtifact,
): StoryboardArtifact {
  const proof = brief.proof[0]?.trim() || "真实素材看得见";
  const offer = brief.offer?.trim() || "点击查看详情";
  const templates = [
    `${brief.audience.painOrDesire}，先看${brief.product.name}`,
    `${brief.coreSellingPoint}，${proof}`,
    `${offer}，马上看详情`,
  ];

  return {
    ...draft,
    shots: draft.shots.map((shot, index) => ({
      ...shot,
      voiceover: clampEffectiveText(
        templates[index] ?? shot.voiceover,
        storyboardScriptVoiceoverLimit(shot.durationSec),
      ),
    })),
  };
}

function toStoryboardArtifact(
  row: Record<string, unknown>,
): StoryboardModuleArtifact {
  return {
    id: String(row.id),
    workspaceId: String(row.workspace_id),
    moduleId: "storyboard",
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
    | "product_brief_artifacts";
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
  const [requirements, materialIntake, productBrief] = await Promise.all([
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
  ]);
  return { requirements, materialIntake, productBrief };
}

async function getArtifactForWorkspace(workspaceId: string, artifactId: string) {
  const result = await db.db2.pool().query(
    `select *
     from storyboard_artifacts
     where workspace_id = $1 and id = $2
     limit 1`,
    [workspaceId, artifactId],
  );
  const row = result.rows[0];
  if (!row) {
    throw new NotFoundError("StoryboardArtifact");
  }
  return toStoryboardArtifact(row);
}

function promptAssembly(input: {
  requirementArtifactId: string;
  data: unknown;
}) {
  const metadata = getModulePromptAssemblyMetadata("storyboard");
  return {
    ...metadata,
    requirementArtifactId: input.requirementArtifactId,
    preview:
      typeof input.data === "object" && input.data
        ? Object.keys(input.data).slice(0, 5).join(", ")
        : "",
  };
}

function upstreamChange(input: {
  artifact: StoryboardModuleArtifact | null;
  promptRequirementsArtifactId: string | null;
  materialIntakeArtifactId: string | null;
  productBriefArtifactId: string | null;
}) {
  if (
    !input.artifact ||
    !input.promptRequirementsArtifactId ||
    !input.materialIntakeArtifactId ||
    !input.productBriefArtifactId
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

  return {
    upstreamChanged: changedSources.length > 0,
    changedSources,
  };
}

export const storyboardService = {
  async propose(input: { workspaceId: string }) {
    const workspace = await db.getWorkspace(input.workspaceId);
    const sources = await currentSources(input.workspaceId);
    const brief = productBriefArtifactSchema.parse(sources.productBrief.data);
    const material = materialIntakeArtifactSchema.parse(
      sources.materialIntake.data,
    );
    const data: StoryboardArtifact = storyboardArtifactSchema.parse(
      runtimeMode() === "real"
        ? (
            await generateStoryboardWithArk(
              {
                brief,
                material,
                creativeRequirements: sources.requirements.data,
              },
              {
                traceLogger: await createWorkspaceTraceLoggerForWorkspace(
                  workspace,
                ),
              },
            )
          ).storyboard
        : toStoryboard(brief),
    );
    assertValidP0StoryboardScript(data);
    assertNoGlobalBannedExpressions(data, brief.bannedExpressions);
    const sourceFingerprint = {
      promptRequirementsArtifactId: sources.requirements.id,
      materialIntakeArtifactId: sources.materialIntake.id,
      productBriefArtifactId: sources.productBrief.id,
    };
    const result = await db.db2.pool().query(
      `insert into storyboard_artifacts
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
    await writeReviewSnapshotForWorkspace({
      workspace,
      artifact: "storyboard",
      status: "proposed",
      schemaVersion: "ugc-storyboard",
      data,
    });
    await db.updateWorkspace(input.workspaceId, {
      status: "storyboard_proposed",
    });
    return toStoryboardArtifact(result.rows[0]);
  },

  async proposeVoiceover(input: {
    workspaceId: string;
    baseArtifactId?: string;
    draft: StoryboardArtifact;
    userDirection?: string;
  }) {
    const workspace = await db.getWorkspace(input.workspaceId);
    const sources = await currentSources(input.workspaceId);
    if (input.baseArtifactId) {
      await getArtifactForWorkspace(input.workspaceId, input.baseArtifactId);
    }

    const brief = productBriefArtifactSchema.parse(sources.productBrief.data);
    const material = materialIntakeArtifactSchema.parse(
      sources.materialIntake.data,
    );
    const draft = storyboardArtifactSchema.parse(input.draft);
    assertValidP0StoryboardStructure(draft);
    const data: StoryboardArtifact = storyboardArtifactSchema.parse(
      runtimeMode() === "real"
        ? (
            await rewriteStoryboardVoiceoversWithArk(
              {
                brief,
                material,
                storyboard: draft,
                userDirection: input.userDirection,
                creativeRequirements: sources.requirements.data,
              },
              {
                traceLogger: await createWorkspaceTraceLoggerForWorkspace(
                  workspace,
                ),
              },
            )
          ).storyboard
        : mockVoiceoverRewrite(brief, draft),
    );
    assertValidP0StoryboardScript(data);

    const sourceFingerprint = {
      promptRequirementsArtifactId: sources.requirements.id,
      materialIntakeArtifactId: sources.materialIntake.id,
      productBriefArtifactId: sources.productBrief.id,
      baseStoryboardArtifactId: input.baseArtifactId ?? null,
      rewriteKind: "voiceover",
    };
    const result = await db.db2.pool().query(
      `insert into storyboard_artifacts
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
    await writeReviewSnapshotForWorkspace({
      workspace,
      artifact: "storyboard",
      status: "proposed",
      schemaVersion: "ugc-storyboard",
      data,
    });
    await db.updateWorkspace(input.workspaceId, {
      status: "storyboard_proposed",
    });
    return toStoryboardArtifact(result.rows[0]);
  },

  async approve(input: {
    workspaceId: string;
    artifactId?: string;
    data?: unknown;
  }) {
    const workspace = await db.getWorkspace(input.workspaceId);
    if (!input.artifactId && input.data === undefined) {
      throw new HttpError(400, "ARTIFACT_DATA_REQUIRED", "artifactId or data is required");
    }

    const sources = await currentSources(input.workspaceId);
    const source = input.artifactId
      ? await getArtifactForWorkspace(input.workspaceId, input.artifactId)
      : null;
    const data = storyboardArtifactSchema.parse(input.data ?? source?.data);
    assertValidP0StoryboardScript(data);
    const sourceFingerprint = source?.sourceFingerprint ?? {
      promptRequirementsArtifactId: sources.requirements.id,
      materialIntakeArtifactId: sources.materialIntake.id,
      productBriefArtifactId: sources.productBrief.id,
    };
    const assembly =
      source?.promptAssembly && Object.keys(source.promptAssembly).length > 0
        ? source.promptAssembly
        : promptAssembly({
            requirementArtifactId: sources.requirements.id,
            data,
          });

    await writeReviewSnapshotForWorkspace({
      workspace,
      artifact: "storyboard",
      status: "approved",
      schemaVersion: "ugc-storyboard",
      data,
    });
    const client = await db.db2.pool().connect();
    try {
      await client.query("begin");
      await client.query(
        `update storyboard_artifacts
         set is_current = false,
             updated_at = now()
         where workspace_id = $1
           and status = 'approved'
           and is_current = true`,
        [input.workspaceId],
      );
      const result = await client.query(
        `insert into storyboard_artifacts
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
         set status = 'storyboard_approved',
             updated_at = now(),
             last_seen_at = now()
         where id = $1`,
        [input.workspaceId],
      );
      await client.query("commit");
      return toStoryboardArtifact(result.rows[0]);
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
    try {
      const sources = await currentSources(workspaceId);
      promptRequirementsArtifactId = sources.requirements.id;
      materialIntakeArtifactId = sources.materialIntake.id;
      productBriefArtifactId = sources.productBrief.id;
    } catch (error) {
      if (!(error instanceof HttpError)) throw error;
    }

    const [proposedResult, currentResult] = await Promise.all([
      db.db2.pool().query(
        `select *
         from storyboard_artifacts
         where workspace_id = $1 and status = 'proposed'
         order by created_at desc, id desc
         limit 1`,
        [workspaceId],
      ),
      db.db2.pool().query(
        `select *
         from storyboard_artifacts
         where workspace_id = $1 and status = 'approved' and is_current = true
         order by approved_at desc, created_at desc, id desc
         limit 1`,
        [workspaceId],
      ),
    ]);
    const proposed = proposedResult.rows[0]
      ? toStoryboardArtifact(proposedResult.rows[0])
      : null;
    const current = currentResult.rows[0]
      ? toStoryboardArtifact(currentResult.rows[0])
      : null;

    return {
      moduleId: "storyboard" as const,
      proposed,
      current,
      upstream: upstreamChange({
        artifact: current,
        promptRequirementsArtifactId,
        materialIntakeArtifactId,
        productBriefArtifactId,
      }),
    };
  },
};
