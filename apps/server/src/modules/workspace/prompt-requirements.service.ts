import { nanoid } from "nanoid";
import { getModulePromptAssemblyMetadata } from "@aigc-video/ai";
import { HttpError, NotFoundError } from "../../common/errors.js";
import { db } from "../../db/client.js";

type PromptRequirementsStatus = "proposed" | "approved" | "archived" | "failed";

export interface PromptRequirementsArtifact {
  id: string;
  workspaceId: string;
  moduleId: "prompt-requirements";
  status: PromptRequirementsStatus;
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

function toPromptRequirementsArtifact(
  row: Record<string, unknown>,
): PromptRequirementsArtifact {
  return {
    id: String(row.id),
    workspaceId: String(row.workspace_id),
    moduleId: "prompt-requirements",
    status: row.status as PromptRequirementsStatus,
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

function jsonbParam(value: unknown) {
  return JSON.stringify(value ?? {});
}

function defaultPromptAssembly(data: unknown) {
  const metadata = getModulePromptAssemblyMetadata("prompt-requirements");
  return {
    ...metadata,
    preview:
      typeof data === "object" && data
        ? Object.keys(data).slice(0, 5).join(", ")
        : "",
  };
}

async function getArtifactForWorkspace(workspaceId: string, artifactId: string) {
  const result = await db.db2.pool().query(
    `select *
     from prompt_requirements_artifacts
     where workspace_id = $1 and id = $2
     limit 1`,
    [workspaceId, artifactId],
  );
  const row = result.rows[0];
  if (!row) {
    throw new NotFoundError("PromptRequirementsArtifact");
  }
  return toPromptRequirementsArtifact(row);
}

export const promptRequirementsService = {
  async propose(workspaceId: string, data: unknown) {
    await db.getWorkspace(workspaceId);
    const client = await db.db2.pool().connect();
    try {
      await client.query("begin");
      const existing = await client.query(
        `select id
         from prompt_requirements_artifacts
         where workspace_id = $1
           and status = 'proposed'
         order by created_at desc, id desc
         limit 1
         for update`,
        [workspaceId],
      );

      const result = existing.rows[0]
        ? await client.query(
            `update prompt_requirements_artifacts
             set data = $2,
                 source_fingerprint = '{}'::jsonb,
                 prompt_assembly = $3,
                 updated_at = now()
             where workspace_id = $1
               and id = $4
             returning *`,
            [
              workspaceId,
              jsonbParam(data),
              jsonbParam(defaultPromptAssembly(data)),
              existing.rows[0].id,
            ],
          )
        : await client.query(
            `insert into prompt_requirements_artifacts
               (id, workspace_id, status, is_current, data, source_fingerprint, prompt_assembly)
             values ($1, $2, 'proposed', false, $3, '{}'::jsonb, $4)
             returning *`,
            [
              nanoid(),
              workspaceId,
              jsonbParam(data),
              jsonbParam(defaultPromptAssembly(data)),
            ],
          );

      await client.query("commit");
      return toPromptRequirementsArtifact(result.rows[0]);
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
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

    const source = input.artifactId
      ? await getArtifactForWorkspace(input.workspaceId, input.artifactId)
      : null;
    const data = input.data ?? source?.data;
    const promptAssembly =
      source?.promptAssembly && Object.keys(source.promptAssembly).length > 0
        ? source.promptAssembly
        : defaultPromptAssembly(data);

    const client = await db.db2.pool().connect();
    try {
      await client.query("begin");
      await client.query(
        `update prompt_requirements_artifacts
         set is_current = false,
             updated_at = now()
         where workspace_id = $1
           and status = 'approved'
           and is_current = true`,
        [input.workspaceId],
      );
      await client.query(
        `update prompt_requirements_artifacts
         set status = 'archived',
             is_current = false,
             updated_at = now()
         where workspace_id = $1
           and status = 'proposed'`,
        [input.workspaceId],
      );
      const result = await client.query(
        `insert into prompt_requirements_artifacts
           (id, workspace_id, status, is_current, data, source_fingerprint, prompt_assembly, approved_at)
         values ($1, $2, 'approved', true, $3, '{}'::jsonb, $4, now())
         returning *`,
        [
          nanoid(),
          input.workspaceId,
          jsonbParam(data),
          jsonbParam(promptAssembly),
        ],
      );
      await client.query("commit");
      return toPromptRequirementsArtifact(result.rows[0]);
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
  },

  async getState(workspaceId: string) {
    await db.getWorkspace(workspaceId);
    const [proposedResult, currentResult] = await Promise.all([
      db.db2.pool().query(
        `select *
         from prompt_requirements_artifacts
         where workspace_id = $1 and status = 'proposed'
         order by created_at desc, id desc
         limit 1`,
        [workspaceId],
      ),
      db.db2.pool().query(
        `select *
         from prompt_requirements_artifacts
         where workspace_id = $1 and status = 'approved' and is_current = true
         order by approved_at desc, created_at desc, id desc
         limit 1`,
        [workspaceId],
      ),
    ]);

    return {
      moduleId: "prompt-requirements" as const,
      proposed: proposedResult.rows[0]
        ? toPromptRequirementsArtifact(proposedResult.rows[0])
        : null,
      current: currentResult.rows[0]
        ? toPromptRequirementsArtifact(currentResult.rows[0])
        : null,
      upstream: {
        upstreamChanged: false,
        changedSources: [],
      },
    };
  },
};
