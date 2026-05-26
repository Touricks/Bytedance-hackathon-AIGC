import { Pool, type PoolClient } from "pg";
import { nanoid } from "nanoid";
import type {
  ArtifactStatus,
  Asset,
  CreativeWorkspace,
  GenerationJob,
  Product,
  Script,
  StoryboardShot,
} from "@aigc-video/shared";
import { config } from "../common/config.js";
import { NotFoundError } from "../common/errors.js";
import { schemaSql } from "./schema/schema.js";

type CreateProductInput = Omit<Product, "id" | "createdAt">;
type CreateAssetInput = Omit<Asset, "id" | "createdAt">;
type CreateJobInput = Pick<GenerationJob, "productId" | "payload"> &
  Partial<Pick<GenerationJob, "scriptId">>;
type CreateScriptInput = Omit<Script, "id" | "createdAt"> &
  Partial<Pick<Script, "id">>;
type CreateShotInput = Omit<StoryboardShot, "id" | "scriptId">;
type CreateWorkspaceInput = Omit<
  CreativeWorkspace,
  "createdAt" | "updatedAt" | "lastSeenAt"
>;
type UpdateWorkspaceInput = Partial<
  Pick<
    CreativeWorkspace,
    "currentScriptId" | "currentJobId" | "status" | "traceFile"
  >
>;
export interface WorkspaceArtifact {
  id: string;
  workspaceId: string;
  scriptId: string;
  type: string;
  status: ArtifactStatus;
  data: unknown;
  createdAt: string;
  updatedAt: string;
  approvedAt?: string;
}
type UpsertWorkspaceArtifactInput = Pick<
  WorkspaceArtifact,
  "workspaceId" | "scriptId" | "type" | "status" | "data"
>;
export interface WorkspaceVideoArchiveRecord {
  id: string;
  workspaceId: string;
  scriptId: string;
  jobId: string;
  provider: string;
  promptView: unknown;
  finalAssetId: string;
  localPath: string;
  localUrl: string;
  providerUrl: string;
  archivedAt: string;
  createdAt: string;
}
type CreateWorkspaceVideoArchiveInput = Omit<
  WorkspaceVideoArchiveRecord,
  "id" | "createdAt"
>;

interface DbAdapter {
  initialize(): Promise<void>;
  close(): Promise<void>;
  createWorkspace(input: CreateWorkspaceInput): Promise<CreativeWorkspace>;
  listWorkspaces(limit?: number): Promise<CreativeWorkspace[]>;
  getWorkspace(workspaceId: string): Promise<CreativeWorkspace>;
  findWorkspaceByLocalPath(
    localPath: string,
  ): Promise<CreativeWorkspace | null>;
  touchWorkspace(workspaceId: string): Promise<CreativeWorkspace>;
  updateWorkspace(
    workspaceId: string,
    patch: UpdateWorkspaceInput,
  ): Promise<CreativeWorkspace>;
  upsertWorkspaceArtifact(
    input: UpsertWorkspaceArtifactInput,
  ): Promise<WorkspaceArtifact>;
  getWorkspaceArtifact(
    workspaceId: string,
    artifactType: string,
  ): Promise<WorkspaceArtifact>;
  createWorkspaceVideoArchive(
    input: CreateWorkspaceVideoArchiveInput,
  ): Promise<WorkspaceVideoArchiveRecord>;
  getWorkspaceVideoArchiveByJob(
    jobId: string,
  ): Promise<WorkspaceVideoArchiveRecord | null>;
  createProduct(input: CreateProductInput): Promise<Product>;
  getProduct(productId: string): Promise<Product>;
  updateProduct(productId: string, patch: Partial<Product>): Promise<Product>;
  createAsset(input: CreateAssetInput): Promise<Asset>;
  getAsset(assetId: string): Promise<Asset>;
  findProductImageAssetByUrl(url: string): Promise<Asset | null>;
  createJob(input: CreateJobInput): Promise<GenerationJob>;
  getJob(jobId: string): Promise<GenerationJob>;
  updateJob(
    jobId: string,
    patch: Partial<GenerationJob>,
  ): Promise<GenerationJob>;
  createScript(input: CreateScriptInput): Promise<Script>;
  getScript(scriptId: string): Promise<Script>;
  updateScript(scriptId: string, patch: Partial<Script>): Promise<Script>;
  freezeScript(scriptId: string): Promise<Script>;
  listShots(scriptId: string): Promise<StoryboardShot[]>;
  createShots(
    scriptId: string,
    shots: CreateShotInput[],
  ): Promise<StoryboardShot[]>;
  replaceShots(
    scriptId: string,
    shots: CreateShotInput[],
  ): Promise<StoryboardShot[]>;
}

function toIsoString(value: unknown): string {
  return value instanceof Date ? value.toISOString() : String(value);
}

function toProduct(row: Record<string, unknown>): Product {
  return {
    id: String(row.id),
    title: String(row.title),
    sellingPoints: String(row.selling_points),
    audience: String(row.audience),
    mainImageAssetId:
      typeof row.main_image_asset_id === "string"
        ? row.main_image_asset_id
        : undefined,
    createdAt: toIsoString(row.created_at),
  };
}

function toAsset(row: Record<string, unknown>): Asset {
  return {
    id: String(row.id),
    type: row.type as Asset["type"],
    url: String(row.url),
    source: row.source as Asset["source"],
    metadata:
      row.metadata && typeof row.metadata === "object"
        ? (row.metadata as Record<string, unknown>)
        : undefined,
    createdAt: toIsoString(row.created_at),
  };
}

function toGenerationJob(row: Record<string, unknown>): GenerationJob {
  return {
    id: String(row.id),
    productId: String(row.product_id),
    status: row.status as GenerationJob["status"],
    stage: row.stage as GenerationJob["stage"],
    progress: Number(row.progress),
    payload:
      row.payload && typeof row.payload === "object"
        ? (row.payload as Record<string, unknown>)
        : {},
    trace: Array.isArray(row.trace) ? row.trace : [],
    errorMessage:
      typeof row.error_message === "string" ? row.error_message : undefined,
    finalAssetId:
      typeof row.final_asset_id === "string" ? row.final_asset_id : undefined,
    scriptId: typeof row.script_id === "string" ? row.script_id : undefined,
    createdAt: toIsoString(row.created_at),
    updatedAt: toIsoString(row.updated_at),
  };
}

function toWorkspace(row: Record<string, unknown>): CreativeWorkspace {
  return {
    id: String(row.id),
    localPath: String(row.local_path),
    currentScriptId: String(row.current_script_id),
    currentJobId:
      typeof row.current_job_id === "string" ? row.current_job_id : undefined,
    status: row.status as CreativeWorkspace["status"],
    traceFile: String(row.trace_file),
    createdAt: toIsoString(row.created_at),
    updatedAt: toIsoString(row.updated_at),
    lastSeenAt: toIsoString(row.last_seen_at),
  };
}

function toWorkspaceArtifact(row: Record<string, unknown>): WorkspaceArtifact {
  return {
    id: String(row.id),
    workspaceId: String(row.workspace_id),
    scriptId: String(row.script_id),
    type: String(row.artifact_type),
    status: row.status as ArtifactStatus,
    data: row.data,
    createdAt: toIsoString(row.created_at),
    updatedAt: toIsoString(row.updated_at),
    approvedAt: row.approved_at ? toIsoString(row.approved_at) : undefined,
  };
}

function toWorkspaceVideoArchive(
  row: Record<string, unknown>,
): WorkspaceVideoArchiveRecord {
  return {
    id: String(row.id),
    workspaceId: String(row.workspace_id),
    scriptId: String(row.script_id),
    jobId: String(row.job_id),
    provider: String(row.provider),
    promptView: row.prompt_view,
    finalAssetId: String(row.final_asset_id),
    localPath: String(row.local_path),
    localUrl: String(row.local_url),
    providerUrl: String(row.provider_url),
    archivedAt: toIsoString(row.archived_at),
    createdAt: toIsoString(row.created_at),
  };
}

function toScript(row: Record<string, unknown>): Script {
  return {
    id: String(row.id),
    productId: String(row.product_id),
    jobId: typeof row.job_id === "string" ? row.job_id : undefined,
    parentScriptId:
      typeof row.parent_script_id === "string"
        ? row.parent_script_id
        : undefined,
    version: Number(row.version),
    narrative: String(row.narrative),
    visualStyle: String(row.visual_style),
    frozen: Boolean(row.frozen),
    frozenAt: row.frozen_at ? toIsoString(row.frozen_at) : undefined,
    rawJson: row.raw_json,
    createdAt: toIsoString(row.created_at),
  };
}

function toStoryboardShot(row: Record<string, unknown>): StoryboardShot {
  return {
    id: String(row.id),
    scriptId: String(row.script_id),
    index: Number(row.shot_index),
    durationSec: Number(row.duration_sec),
    purpose: row.purpose as StoryboardShot["purpose"],
    visualPrompt: String(row.visual_prompt),
    cameraMotion: String(row.camera_motion),
    voiceover: String(row.voiceover),
    subtitle: String(row.subtitle),
    mediaAssetId:
      typeof row.media_asset_id === "string" ? row.media_asset_id : undefined,
    status: row.status as StoryboardShot["status"],
  };
}

function firstRow<T>(
  rows: Record<string, unknown>[],
  entityName: string,
  map: (row: Record<string, unknown>) => T,
): T {
  const row = rows[0];
  if (!row) {
    throw new NotFoundError(entityName);
  }
  return map(row);
}

function jsonbParam(value: unknown): string | null {
  return value === undefined ? null : JSON.stringify(value);
}

class PostgresDbAdapter implements DbAdapter {
  private pool: Pool | undefined;

  constructor(private readonly connectionString: string) {}

  async initialize() {
    this.pool ??= new Pool({ connectionString: this.connectionString });
    await this.pool.query(schemaSql);
  }

  async close() {
    if (!this.pool) {
      return;
    }
    await this.pool.end();
    this.pool = undefined;
  }

  private getPool(): Pool {
    if (!this.pool) {
      throw new Error("Database has not been initialized");
    }
    return this.pool;
  }

  async createWorkspace(
    input: CreateWorkspaceInput,
  ): Promise<CreativeWorkspace> {
    const result = await this.getPool().query(
      `insert into creative_workspace
         (id, local_path, current_script_id, current_job_id, status, trace_file)
       values ($1, $2, $3, $4, $5, $6)
       on conflict (local_path) do update
       set current_script_id = creative_workspace.current_script_id,
           current_job_id = creative_workspace.current_job_id,
           status = creative_workspace.status,
           trace_file = excluded.trace_file,
           updated_at = now(),
           last_seen_at = now()
       returning *`,
      [
        input.id,
        input.localPath,
        input.currentScriptId,
        input.currentJobId ?? null,
        input.status,
        input.traceFile,
      ],
    );
    return firstRow(result.rows, "CreativeWorkspace", toWorkspace);
  }

  async listWorkspaces(limit = 50): Promise<CreativeWorkspace[]> {
    const result = await this.getPool().query(
      `select *
       from creative_workspace
       order by last_seen_at desc, created_at desc
       limit $1`,
      [limit],
    );
    return result.rows.map(toWorkspace);
  }

  async getWorkspace(workspaceId: string): Promise<CreativeWorkspace> {
    const result = await this.getPool().query(
      "select * from creative_workspace where id = $1",
      [workspaceId],
    );
    return firstRow(result.rows, "CreativeWorkspace", toWorkspace);
  }

  async findWorkspaceByLocalPath(
    localPath: string,
  ): Promise<CreativeWorkspace | null> {
    const result = await this.getPool().query(
      "select * from creative_workspace where local_path = $1",
      [localPath],
    );
    const row = result.rows[0];
    return row ? toWorkspace(row) : null;
  }

  async touchWorkspace(workspaceId: string): Promise<CreativeWorkspace> {
    const result = await this.getPool().query(
      `update creative_workspace
       set last_seen_at = now(),
           updated_at = now()
       where id = $1
       returning *`,
      [workspaceId],
    );
    return firstRow(result.rows, "CreativeWorkspace", toWorkspace);
  }

  async updateWorkspace(
    workspaceId: string,
    patch: UpdateWorkspaceInput,
  ): Promise<CreativeWorkspace> {
    const workspace = await this.getWorkspace(workspaceId);
    const next = { ...workspace, ...patch };
    const result = await this.getPool().query(
      `update creative_workspace
       set current_script_id = $2,
           current_job_id = $3,
           status = $4,
           trace_file = $5,
           updated_at = now(),
           last_seen_at = now()
       where id = $1
       returning *`,
      [
        workspaceId,
        next.currentScriptId,
        next.currentJobId ?? null,
        next.status,
        next.traceFile,
      ],
    );
    return firstRow(result.rows, "CreativeWorkspace", toWorkspace);
  }

  async upsertWorkspaceArtifact(
    input: UpsertWorkspaceArtifactInput,
  ): Promise<WorkspaceArtifact> {
    const result = await this.getPool().query(
      `insert into workspace_artifact
         (id, workspace_id, script_id, artifact_type, status, data, approved_at)
       values ($1, $2, $3, $4, $5, $6, case when $5 = 'approved' then now() else null end)
       on conflict (workspace_id, artifact_type) do update
       set script_id = excluded.script_id,
           status = excluded.status,
           data = excluded.data,
           approved_at = case
             when excluded.status = 'approved' then coalesce(workspace_artifact.approved_at, now())
             else null
           end,
           updated_at = now()
       returning *`,
      [
        nanoid(),
        input.workspaceId,
        input.scriptId,
        input.type,
        input.status,
        jsonbParam(input.data),
      ],
    );
    return firstRow(result.rows, "WorkspaceArtifact", toWorkspaceArtifact);
  }

  async getWorkspaceArtifact(
    workspaceId: string,
    artifactType: string,
  ): Promise<WorkspaceArtifact> {
    const result = await this.getPool().query(
      `select *
       from workspace_artifact
       where workspace_id = $1 and artifact_type = $2`,
      [workspaceId, artifactType],
    );
    return firstRow(result.rows, "WorkspaceArtifact", toWorkspaceArtifact);
  }

  async createWorkspaceVideoArchive(
    input: CreateWorkspaceVideoArchiveInput,
  ): Promise<WorkspaceVideoArchiveRecord> {
    const result = await this.getPool().query(
      `insert into workspace_video_archive
         (id, workspace_id, script_id, job_id, provider, prompt_view, final_asset_id, local_path, local_url, provider_url, archived_at)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       on conflict (job_id) do update
       set provider = excluded.provider,
           prompt_view = excluded.prompt_view,
           final_asset_id = excluded.final_asset_id,
           local_path = excluded.local_path,
           local_url = excluded.local_url,
           provider_url = excluded.provider_url,
           archived_at = excluded.archived_at
       returning *`,
      [
        nanoid(),
        input.workspaceId,
        input.scriptId,
        input.jobId,
        input.provider,
        jsonbParam(input.promptView),
        input.finalAssetId,
        input.localPath,
        input.localUrl,
        input.providerUrl,
        input.archivedAt,
      ],
    );
    return firstRow(
      result.rows,
      "WorkspaceVideoArchive",
      toWorkspaceVideoArchive,
    );
  }

  async getWorkspaceVideoArchiveByJob(
    jobId: string,
  ): Promise<WorkspaceVideoArchiveRecord | null> {
    const result = await this.getPool().query(
      `select *
       from workspace_video_archive
       where job_id = $1`,
      [jobId],
    );
    const row = result.rows[0];
    return row ? toWorkspaceVideoArchive(row) : null;
  }

  async createProduct(input: CreateProductInput): Promise<Product> {
    const result = await this.getPool().query(
      `insert into product (id, title, selling_points, audience, main_image_asset_id)
       values ($1, $2, $3, $4, $5)
       returning *`,
      [
        nanoid(),
        input.title,
        input.sellingPoints,
        input.audience,
        input.mainImageAssetId ?? null,
      ],
    );
    return firstRow(result.rows, "Product", toProduct);
  }

  async getProduct(productId: string): Promise<Product> {
    const result = await this.getPool().query(
      "select * from product where id = $1",
      [productId],
    );
    return firstRow(result.rows, "Product", toProduct);
  }

  async updateProduct(
    productId: string,
    patch: Partial<Product>,
  ): Promise<Product> {
    const product = await this.getProduct(productId);
    const next = { ...product, ...patch };
    const result = await this.getPool().query(
      `update product
       set title = $2,
           selling_points = $3,
           audience = $4,
           main_image_asset_id = $5
       where id = $1
       returning *`,
      [
        productId,
        next.title,
        next.sellingPoints,
        next.audience,
        next.mainImageAssetId ?? null,
      ],
    );
    return firstRow(result.rows, "Product", toProduct);
  }

  async createAsset(input: CreateAssetInput): Promise<Asset> {
    const result = await this.getPool().query(
      `insert into asset (id, type, url, source, metadata)
       values ($1, $2, $3, $4, $5)
       returning *`,
      [
        nanoid(),
        input.type,
        input.url,
        input.source,
        jsonbParam(input.metadata),
      ],
    );
    return firstRow(result.rows, "Asset", toAsset);
  }

  async getAsset(assetId: string): Promise<Asset> {
    const result = await this.getPool().query(
      "select * from asset where id = $1",
      [assetId],
    );
    return firstRow(result.rows, "Asset", toAsset);
  }

  async findProductImageAssetByUrl(url: string): Promise<Asset | null> {
    const result = await this.getPool().query(
      `select *
       from asset
       where type = 'product_image' and url = $1
       order by created_at desc
       limit 1`,
      [url],
    );
    const row = result.rows[0];
    return row ? toAsset(row) : null;
  }

  async createJob(input: CreateJobInput): Promise<GenerationJob> {
    if (input.scriptId) {
      await this.freezeScript(input.scriptId);
    }

    const result = await this.getPool().query(
      `insert into generation_job
         (id, product_id, script_id, status, stage, progress, payload, trace)
       values ($1, $2, $3, 'queued', 'queued', 0, $4, '[]'::jsonb)
       returning *`,
      [
        nanoid(),
        input.productId,
        input.scriptId ?? null,
        jsonbParam(input.payload),
      ],
    );
    return firstRow(result.rows, "GenerationJob", toGenerationJob);
  }

  async getJob(jobId: string): Promise<GenerationJob> {
    const result = await this.getPool().query(
      "select * from generation_job where id = $1",
      [jobId],
    );
    return firstRow(result.rows, "GenerationJob", toGenerationJob);
  }

  async updateJob(
    jobId: string,
    patch: Partial<GenerationJob>,
  ): Promise<GenerationJob> {
    const job = await this.getJob(jobId);
    const next = { ...job, ...patch };
    const result = await this.getPool().query(
      `update generation_job
       set status = $2,
           stage = $3,
           progress = $4,
           payload = $5,
           trace = $6,
           error_message = $7,
           final_asset_id = $8,
           script_id = $9,
           updated_at = now()
       where id = $1
       returning *`,
      [
        jobId,
        next.status,
        next.stage,
        next.progress,
        jsonbParam(next.payload),
        jsonbParam(next.trace),
        next.errorMessage ?? null,
        next.finalAssetId ?? null,
        next.scriptId ?? null,
      ],
    );
    return firstRow(result.rows, "GenerationJob", toGenerationJob);
  }

  async createScript(input: CreateScriptInput): Promise<Script> {
    const result = await this.getPool().query(
      `insert into script
         (id, product_id, job_id, parent_script_id, version, narrative, visual_style, frozen, frozen_at, raw_json)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       returning *`,
      [
        input.id ?? nanoid(),
        input.productId,
        input.jobId ?? null,
        input.parentScriptId ?? null,
        input.version,
        input.narrative,
        input.visualStyle,
        input.frozen ?? false,
        input.frozenAt ?? null,
        jsonbParam(input.rawJson),
      ],
    );
    return firstRow(result.rows, "Script", toScript);
  }

  async getScript(scriptId: string): Promise<Script> {
    const result = await this.getPool().query(
      "select * from script where id = $1",
      [scriptId],
    );
    return firstRow(result.rows, "Script", toScript);
  }

  async updateScript(
    scriptId: string,
    patch: Partial<Script>,
  ): Promise<Script> {
    const script = await this.getScript(scriptId);
    const next = {
      ...script,
      ...patch,
      id: script.id,
      productId: script.productId,
      version: script.version,
      createdAt: script.createdAt,
    };
    const result = await this.getPool().query(
      `update script
       set job_id = $2,
           parent_script_id = $3,
           narrative = $4,
           visual_style = $5,
           frozen = $6,
           frozen_at = $7,
           raw_json = $8
       where id = $1
       returning *`,
      [
        scriptId,
        next.jobId ?? null,
        next.parentScriptId ?? null,
        next.narrative,
        next.visualStyle,
        next.frozen,
        next.frozenAt ?? null,
        jsonbParam(next.rawJson),
      ],
    );
    return firstRow(result.rows, "Script", toScript);
  }

  async freezeScript(scriptId: string): Promise<Script> {
    const script = await this.getScript(scriptId);
    if (script.frozen) {
      return script;
    }

    const result = await this.getPool().query(
      `update script
       set frozen = true,
           frozen_at = now()
       where id = $1
       returning *`,
      [scriptId],
    );
    return firstRow(result.rows, "Script", toScript);
  }

  async listShots(scriptId: string): Promise<StoryboardShot[]> {
    const result = await this.getPool().query(
      "select * from storyboard_shot where script_id = $1 order by shot_index",
      [scriptId],
    );
    return result.rows.map(toStoryboardShot);
  }

  async createShots(
    scriptId: string,
    shots: CreateShotInput[],
  ): Promise<StoryboardShot[]> {
    const client = await this.getPool().connect();
    try {
      await client.query("begin");
      const created = await this.insertShots(client, scriptId, shots);
      await client.query("commit");
      return created;
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
  }

  async replaceShots(
    scriptId: string,
    shots: CreateShotInput[],
  ): Promise<StoryboardShot[]> {
    const client = await this.getPool().connect();
    try {
      await client.query("begin");
      await client.query("delete from storyboard_shot where script_id = $1", [
        scriptId,
      ]);
      const created = await this.insertShots(client, scriptId, shots);
      await client.query("commit");
      return created;
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
  }

  private async insertShots(
    client: PoolClient,
    scriptId: string,
    shots: CreateShotInput[],
  ): Promise<StoryboardShot[]> {
    const created: StoryboardShot[] = [];
    for (const shot of shots) {
      const result = await client.query(
        `insert into storyboard_shot
           (id, script_id, shot_index, duration_sec, purpose, visual_prompt, camera_motion, voiceover, subtitle, media_asset_id, status)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
         returning *`,
        [
          nanoid(),
          scriptId,
          shot.index,
          shot.durationSec,
          shot.purpose ?? null,
          shot.visualPrompt,
          shot.cameraMotion,
          shot.voiceover,
          shot.subtitle,
          shot.mediaAssetId ?? null,
          shot.status,
        ],
      );
      created.push(firstRow(result.rows, "StoryboardShot", toStoryboardShot));
    }
    return created;
  }
}

let adapter: DbAdapter | undefined;

function getAdapter(): DbAdapter {
  adapter ??= new PostgresDbAdapter(config.databaseUrl);
  return adapter;
}

export const db: DbAdapter = {
  initialize: () => getAdapter().initialize(),
  close: () => getAdapter().close(),
  createWorkspace: (input) => getAdapter().createWorkspace(input),
  listWorkspaces: (limit) => getAdapter().listWorkspaces(limit),
  getWorkspace: (workspaceId) => getAdapter().getWorkspace(workspaceId),
  findWorkspaceByLocalPath: (localPath) =>
    getAdapter().findWorkspaceByLocalPath(localPath),
  touchWorkspace: (workspaceId) => getAdapter().touchWorkspace(workspaceId),
  updateWorkspace: (workspaceId, patch) =>
    getAdapter().updateWorkspace(workspaceId, patch),
  upsertWorkspaceArtifact: (input) =>
    getAdapter().upsertWorkspaceArtifact(input),
  getWorkspaceArtifact: (workspaceId, artifactType) =>
    getAdapter().getWorkspaceArtifact(workspaceId, artifactType),
  createWorkspaceVideoArchive: (input) =>
    getAdapter().createWorkspaceVideoArchive(input),
  getWorkspaceVideoArchiveByJob: (jobId) =>
    getAdapter().getWorkspaceVideoArchiveByJob(jobId),
  createProduct: (input) => getAdapter().createProduct(input),
  getProduct: (productId) => getAdapter().getProduct(productId),
  updateProduct: (productId, patch) =>
    getAdapter().updateProduct(productId, patch),
  createAsset: (input) => getAdapter().createAsset(input),
  getAsset: (assetId) => getAdapter().getAsset(assetId),
  findProductImageAssetByUrl: (url) =>
    getAdapter().findProductImageAssetByUrl(url),
  createJob: (input) => getAdapter().createJob(input),
  getJob: (jobId) => getAdapter().getJob(jobId),
  updateJob: (jobId, patch) => getAdapter().updateJob(jobId, patch),
  createScript: (input) => getAdapter().createScript(input),
  getScript: (scriptId) => getAdapter().getScript(scriptId),
  updateScript: (scriptId, patch) => getAdapter().updateScript(scriptId, patch),
  freezeScript: (scriptId) => getAdapter().freezeScript(scriptId),
  listShots: (scriptId) => getAdapter().listShots(scriptId),
  createShots: (scriptId, shots) => getAdapter().createShots(scriptId, shots),
  replaceShots: (scriptId, shots) => getAdapter().replaceShots(scriptId, shots),
};
