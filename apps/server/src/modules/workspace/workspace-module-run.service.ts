import { nanoid } from "nanoid";
import { HttpError } from "../../common/errors.js";
import { db } from "../../db/client.js";

export type WorkspaceModuleRunModuleId =
  | "material-intake"
  | "product-brief"
  | "storyboard"
  | "shotprompt"
  | "shot-set";

export type WorkspaceModuleRunStatus =
  | "PENDING"
  | "RUNNING"
  | "SUCCEEDED"
  | "FAILED"
  | "CANCELLED"
  | "TIMED_OUT";

export interface WorkspaceModuleRunView {
  id: string;
  workspaceId: string;
  moduleId: WorkspaceModuleRunModuleId;
  operation: string;
  status: WorkspaceModuleRunStatus;
  runtimeBuilder: string | null;
  provider: string | null;
  sourceFingerprint: Record<string, unknown>;
  artifactId: string | null;
  errorCode: string | null;
  errorMessage: string | null;
  startedAt: string;
  completedAt: string | null;
  heartbeatAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface WorkspaceModuleRuntimeView {
  activeRuns: WorkspaceModuleRunView[];
  latestRunsByModule: Partial<Record<WorkspaceModuleRunModuleId, WorkspaceModuleRunView>>;
}

const activeStatuses = new Set<WorkspaceModuleRunStatus>(["PENDING", "RUNNING"]);

function toIsoString(value: unknown): string {
  return value instanceof Date ? value.toISOString() : String(value);
}

function jsonbParam(value: unknown) {
  return JSON.stringify(value ?? {});
}

function sourceFingerprintView(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function errorCodeFor(error: unknown) {
  return error instanceof HttpError ? error.code : "WORKSPACE_MODULE_RUN_FAILED";
}

function errorMessageFor(error: unknown) {
  if (error instanceof Error) return error.message.slice(0, 1000);
  return String(error).slice(0, 1000);
}

function isUniqueViolation(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: string }).code === "23505"
  );
}

export function workspaceModuleRunIsActive(
  run: Pick<WorkspaceModuleRunView, "status"> | null | undefined,
) {
  return Boolean(run && activeStatuses.has(run.status));
}

export function toWorkspaceModuleRunView(row: Record<string, unknown>): WorkspaceModuleRunView {
  return {
    id: String(row.id),
    workspaceId: String(row.workspace_id),
    moduleId: String(row.module_id) as WorkspaceModuleRunModuleId,
    operation: String(row.operation),
    status: String(row.status) as WorkspaceModuleRunStatus,
    runtimeBuilder: typeof row.runtime_builder === "string" ? row.runtime_builder : null,
    provider: typeof row.provider === "string" ? row.provider : null,
    sourceFingerprint: sourceFingerprintView(row.source_fingerprint),
    artifactId: typeof row.artifact_id === "string" ? row.artifact_id : null,
    errorCode: typeof row.error_code === "string" ? row.error_code : null,
    errorMessage: typeof row.error_message === "string" ? row.error_message : null,
    startedAt: toIsoString(row.started_at),
    completedAt: row.completed_at ? toIsoString(row.completed_at) : null,
    heartbeatAt: toIsoString(row.heartbeat_at),
    createdAt: toIsoString(row.created_at),
    updatedAt: toIsoString(row.updated_at),
  };
}

async function getActiveRun(input: {
  workspaceId: string;
  moduleId: WorkspaceModuleRunModuleId;
}) {
  const result = await db.db2.pool().query(
    `select *
     from workspace_module_runs
     where workspace_id = $1
       and module_id = $2
       and status in ('PENDING', 'RUNNING')
     order by created_at desc, id desc
     limit 1`,
    [input.workspaceId, input.moduleId],
  );
  return result.rows[0] ? toWorkspaceModuleRunView(result.rows[0]) : null;
}

function activeRunError(run: WorkspaceModuleRunView) {
  return new HttpError(
    409,
    "WORKSPACE_MODULE_RUN_ACTIVE",
    `${run.moduleId} ${run.operation} is already ${run.status}`,
  );
}

export const workspaceModuleRunService = {
  async start(input: {
    workspaceId: string;
    moduleId: WorkspaceModuleRunModuleId;
    operation: string;
    runtimeBuilder?: string | null;
    provider?: string | null;
    sourceFingerprint?: Record<string, unknown>;
  }) {
    const active = await getActiveRun(input);
    if (active) throw activeRunError(active);

    const id = nanoid();
    try {
      const result = await db.db2.pool().query(
        `insert into workspace_module_runs
           (id, workspace_id, module_id, operation, status, runtime_builder, provider,
            source_fingerprint)
         values ($1, $2, $3, $4, 'RUNNING', $5, $6, $7)
         returning *`,
        [
          id,
          input.workspaceId,
          input.moduleId,
          input.operation,
          input.runtimeBuilder ?? null,
          input.provider ?? null,
          jsonbParam(input.sourceFingerprint ?? {}),
        ],
      );
      return toWorkspaceModuleRunView(result.rows[0]);
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
      const existing = await getActiveRun(input);
      if (existing) throw activeRunError(existing);
      throw error;
    }
  },

  async complete(input: { runId: string; artifactId?: string | null }) {
    const result = await db.db2.pool().query(
      `update workspace_module_runs
       set status = 'SUCCEEDED',
           artifact_id = coalesce($2, artifact_id),
           completed_at = now(),
           heartbeat_at = now(),
           updated_at = now()
       where id = $1
       returning *`,
      [input.runId, input.artifactId ?? null],
    );
    return result.rows[0] ? toWorkspaceModuleRunView(result.rows[0]) : null;
  },

  async fail(input: { runId: string; error: unknown }) {
    const result = await db.db2.pool().query(
      `update workspace_module_runs
       set status = 'FAILED',
           error_code = $2,
           error_message = $3,
           completed_at = now(),
           heartbeat_at = now(),
           updated_at = now()
       where id = $1
       returning *`,
      [input.runId, errorCodeFor(input.error), errorMessageFor(input.error)],
    );
    return result.rows[0] ? toWorkspaceModuleRunView(result.rows[0]) : null;
  },

  async withRun<T>(input: {
    workspaceId: string;
    moduleId: WorkspaceModuleRunModuleId;
    operation: string;
    runtimeBuilder?: string | null;
    provider?: string | null;
    sourceFingerprint?: Record<string, unknown>;
    run: () => Promise<T>;
    artifactId?: (result: T) => string | null | undefined;
  }) {
    const run = await this.start(input);
    try {
      const result = await input.run();
      await this.complete({
        runId: run.id,
        artifactId: input.artifactId?.(result) ?? null,
      });
      return result;
    } catch (error) {
      await this.fail({ runId: run.id, error });
      throw error;
    }
  },

  async listWorkspaceRuntime(workspaceId: string): Promise<WorkspaceModuleRuntimeView> {
    const [activeResult, latestResult] = await Promise.all([
      db.db2.pool().query(
        `select *
         from workspace_module_runs
         where workspace_id = $1
           and status in ('PENDING', 'RUNNING')
         order by created_at desc, id desc`,
        [workspaceId],
      ),
      db.db2.pool().query(
        `select distinct on (module_id) *
         from workspace_module_runs
         where workspace_id = $1
         order by module_id, created_at desc, id desc`,
        [workspaceId],
      ),
    ]);

    const latestRunsByModule = Object.fromEntries(
      latestResult.rows.map((row) => {
        const run = toWorkspaceModuleRunView(row);
        return [run.moduleId, run];
      }),
    ) as WorkspaceModuleRuntimeView["latestRunsByModule"];

    return {
      activeRuns: activeResult.rows.map(toWorkspaceModuleRunView),
      latestRunsByModule,
    };
  },
};
