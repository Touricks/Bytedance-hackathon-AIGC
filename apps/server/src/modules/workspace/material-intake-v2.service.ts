import { nanoid } from "nanoid";
import {
  generateMaterialIntakeWithArk,
  getModulePromptAssemblyMetadata,
} from "@aigc-video/ai";
import {
  materialIntakeArtifactSchema,
  type MaterialIntakeArtifact,
} from "@aigc-video/shared";
import { HttpError, NotFoundError } from "../../common/errors.js";
import { db } from "../../db/client.js";
import {
  applySelectedMaterialRefs,
  collectWorkspaceMaterialLibraryForWorkspace,
  copySelectedLegacyRootMaterials,
  createWorkspaceTraceLoggerForWorkspace,
  materialIntakeTextPreviewsForWorkspace,
  runtimeMode,
} from "./workspace.service.js";

type ModuleArtifactStatus = "proposed" | "approved" | "archived" | "failed";

export interface MaterialIntakeModuleArtifact {
  id: string;
  workspaceId: string;
  moduleId: "material-intake";
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

function toMaterialIntakeArtifact(
  row: Record<string, unknown>,
): MaterialIntakeModuleArtifact {
  return {
    id: String(row.id),
    workspaceId: String(row.workspace_id),
    moduleId: "material-intake",
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

async function currentPromptRequirements(workspaceId: string) {
  const result = await db.db2.pool().query(
    `select *
     from prompt_requirements_artifacts
     where workspace_id = $1
       and status = 'approved'
       and is_current = true
     order by approved_at desc, created_at desc, id desc
     limit 1`,
    [workspaceId],
  );
  const row = result.rows[0];
  if (!row) {
    throw new HttpError(
      400,
      "NO_CURRENT_APPROVED_ARTIFACT",
      "Current approved prompt requirements are required",
    );
  }
  return {
    id: String(row.id),
    data: row.data,
  };
}

async function getArtifactForWorkspace(workspaceId: string, artifactId: string) {
  const result = await db.db2.pool().query(
    `select *
     from material_intake_artifacts
     where workspace_id = $1 and id = $2
     limit 1`,
    [workspaceId, artifactId],
  );
  const row = result.rows[0];
  if (!row) {
    throw new NotFoundError("MaterialIntakeArtifact");
  }
  return toMaterialIntakeArtifact(row);
}

function promptAssembly(input: {
  requirementArtifactId: string;
  data: unknown;
}) {
  const metadata = getModulePromptAssemblyMetadata("material-intake");
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
  artifact: MaterialIntakeModuleArtifact | null;
  currentPromptRequirementsArtifactId: string | null;
}) {
  if (!input.artifact || !input.currentPromptRequirementsArtifactId) {
    return { upstreamChanged: false, changedSources: [] };
  }

  const sourceId = input.artifact.sourceFingerprint.promptRequirementsArtifactId;
  const changed = sourceId !== input.currentPromptRequirementsArtifactId;
  return {
    upstreamChanged: changed,
    changedSources: changed ? ["promptRequirementsArtifactId"] : [],
  };
}

export const materialIntakeV2Service = {
  async propose(input: {
    workspaceId: string;
    selectedMaterialRefs?: string[];
    userDirection?: string;
  }) {
    const workspace = await db.getWorkspace(input.workspaceId);
    const requirements = await currentPromptRequirements(input.workspaceId);
    const binding = await db.getActiveWorkspaceStorage(input.workspaceId);
    if (binding?.kind === "LOCAL" && binding.localPath) {
      await copySelectedLegacyRootMaterials({
        directory: binding.localPath,
        selectedMaterialRefs: input.selectedMaterialRefs,
      });
    }
    const materialLibrary = await collectWorkspaceMaterialLibraryForWorkspace(
      input.workspaceId,
    );
    const selectedLibrary = applySelectedMaterialRefs(
      materialLibrary,
      input.selectedMaterialRefs,
    );
    const scanned = materialIntakeArtifactSchema.parse({
      ...selectedLibrary,
      primaryProductRef: selectedLibrary.primaryProductRef ?? "",
    });
    const textPreviews = await materialIntakeTextPreviewsForWorkspace(
      input.workspaceId,
      scanned,
    );
    const data: MaterialIntakeArtifact =
      runtimeMode() === "real"
        ? (
            await generateMaterialIntakeWithArk(
              {
                initialPrompt: input.userDirection,
                scanned,
                textPreviews,
                creativeRequirements: requirements.data,
              },
              {
                traceLogger: await createWorkspaceTraceLoggerForWorkspace(
                  workspace,
                ),
              },
            )
          ).material
        : scanned;
    const sourceFingerprint = {
      promptRequirementsArtifactId: requirements.id,
    };
    const result = await db.db2.pool().query(
      `insert into material_intake_artifacts
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
            requirementArtifactId: requirements.id,
            data,
          }),
        ),
      ],
    );
    return toMaterialIntakeArtifact(result.rows[0]);
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

    const requirements = await currentPromptRequirements(input.workspaceId);
    const source = input.artifactId
      ? await getArtifactForWorkspace(input.workspaceId, input.artifactId)
      : null;
    const data = materialIntakeArtifactSchema.parse(input.data ?? source?.data);
    const sourceFingerprint = source?.sourceFingerprint ?? {
      promptRequirementsArtifactId: requirements.id,
    };
    const assembly =
      source?.promptAssembly && Object.keys(source.promptAssembly).length > 0
        ? source.promptAssembly
        : promptAssembly({
            requirementArtifactId: requirements.id,
            data,
          });

    const client = await db.db2.pool().connect();
    try {
      await client.query("begin");
      await client.query(
        `update material_intake_artifacts
         set is_current = false,
             updated_at = now()
         where workspace_id = $1
           and status = 'approved'
           and is_current = true`,
        [input.workspaceId],
      );
      const result = await client.query(
        `insert into material_intake_artifacts
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
         set status = 'materials_ready',
             updated_at = now(),
             last_seen_at = now()
         where id = $1`,
        [input.workspaceId],
      );
      await client.query("commit");
      return toMaterialIntakeArtifact(result.rows[0]);
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
  },

  async getState(workspaceId: string) {
    await db.getWorkspace(workspaceId);
    let requirementsId: string | null = null;
    try {
      requirementsId = (await currentPromptRequirements(workspaceId)).id;
    } catch (error) {
      if (!(error instanceof HttpError)) throw error;
    }

    const [proposedResult, currentResult] = await Promise.all([
      db.db2.pool().query(
        `select *
         from material_intake_artifacts
         where workspace_id = $1 and status = 'proposed'
         order by created_at desc, id desc
         limit 1`,
        [workspaceId],
      ),
      db.db2.pool().query(
        `select *
         from material_intake_artifacts
         where workspace_id = $1 and status = 'approved' and is_current = true
         order by approved_at desc, created_at desc, id desc
         limit 1`,
        [workspaceId],
      ),
    ]);
    const proposed = proposedResult.rows[0]
      ? toMaterialIntakeArtifact(proposedResult.rows[0])
      : null;
    const current = currentResult.rows[0]
      ? toMaterialIntakeArtifact(currentResult.rows[0])
      : null;

    return {
      moduleId: "material-intake" as const,
      proposed,
      current,
      upstream: upstreamChange({
        artifact: current,
        currentPromptRequirementsArtifactId: requirementsId,
      }),
    };
  },
};
