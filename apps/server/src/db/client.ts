import { Pool, type PoolClient } from "pg";
import { nanoid } from "nanoid";
import type {
  ArtifactStatus,
  Asset,
  CreativeWorkspace,
  GenerationJob,
  Product,
  Script,
  StoryboardShot
} from "@aigc-video/shared";
import { config } from "../common/config.js";
import { NotFoundError } from "../common/errors.js";
import { schemaSql } from "./schema/schema.js";

type CreateProductInput = Omit<Product, "id" | "createdAt">;
type CreateAssetInput = Omit<Asset, "id" | "createdAt">;
type CreateJobInput = Pick<GenerationJob, "productId" | "payload"> &
  Partial<Pick<GenerationJob, "scriptId">>;
type CreateScriptInput = Omit<Script, "id" | "createdAt"> & Partial<Pick<Script, "id">>;
type CreateShotInput = Omit<StoryboardShot, "id" | "scriptId">;
type CreateWorkspaceInput = Omit<
  CreativeWorkspace,
  "createdAt" | "updatedAt" | "lastSeenAt" | "localPath"
> & { localPath?: string | null };
type UpdateWorkspaceInput = Partial<
  Pick<CreativeWorkspace, "currentScriptId" | "currentJobId" | "status" | "traceFile">
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

// ─── v2 row types ────────────────────────────────────────────────────────────

export interface StoryboardShotRow {
  id: string;
  workspaceId: string;
  scriptId: string;
  orderIndex: number;
  title: string;
  objective: string | null;
  defaultDurationSec: number | null;
  status: string;
  nextAction: string | null;
  activeImagePromptArtifactId: string | null;
  selectedImageId: string | null;
  activeVideoScriptArtifactId: string | null;
  selectedVideoId: string | null;
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ImagePromptArtifactRow {
  id: string;
  shotId: string;
  version: number;
  status: "DRAFT" | "ACTIVE" | "APPROVED" | "STALE" | "ARCHIVED";
  promptText: string;
  negativePrompt: string | null;
  referenceAssetIds: string[];
  promptJson: unknown;
  sourceFingerprint: unknown;
  promptAssembly: unknown;
  createdBy: string;
  agentName: string | null;
  promptTemplateVersion: string | null;
  baseArtifactId: string | null;
  createdAt: string;
}

export interface ImageGenerationBatchRow {
  id: string;
  workspaceId: string;
  shotId: string;
  imagePromptArtifactId: string;
  status: "PENDING" | "RUNNING" | "SUCCEEDED" | "PARTIAL" | "FAILED" | "CANCELLED";
  requestedCount: number;
  succeededCount: number;
  failedCount: number;
  provider: string;
  aspectRatio: string;
  providerRequest: unknown;
  errorMessage: string | null;
  idempotencyKey: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ImageCandidateRow {
  id: string;
  batchId: string;
  workspaceId: string;
  shotId: string;
  imageUrl: string | null;
  objectKey: string | null;
  width: number | null;
  height: number | null;
  seed: string | null;
  provider: string;
  providerResponse: unknown;
  status: "PENDING" | "RUNNING" | "SUCCEEDED" | "FAILED" | "REJECTED";
  errorMessage: string | null;
  createdAt: string;
}

export interface VideoScriptArtifactRow {
  id: string;
  shotId: string;
  version: number;
  status: "DRAFT" | "ACTIVE" | "APPROVED" | "STALE" | "ARCHIVED";
  durationSec: number;
  scriptJson: unknown;
  providerPrompt: string;
  basedOnImageCandidateId: string;
  basedOnPrevImageCandidateId: string | null;
  basedOnNextImageCandidateId: string | null;
  sourceFingerprint: unknown;
  promptAssembly: unknown;
  createdBy: string;
  agentName: string | null;
  promptTemplateVersion: string | null;
  baseArtifactId: string | null;
  createdAt: string;
}

export interface VideoGenerationBatchRow {
  id: string;
  workspaceId: string;
  shotId: string;
  videoScriptArtifactId: string;
  status: ImageGenerationBatchRow["status"];
  requestedCount: number;
  succeededCount: number;
  failedCount: number;
  provider: string;
  aspectRatio: string;
  providerRequest: unknown;
  errorMessage: string | null;
  idempotencyKey: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface VideoCandidateRow {
  id: string;
  batchId: string;
  workspaceId: string;
  shotId: string;
  videoUrl: string | null;
  objectKey: string | null;
  thumbnailUrl: string | null;
  durationSec: number | null;
  width: number | null;
  height: number | null;
  provider: string;
  providerResponse: unknown;
  status: ImageCandidateRow["status"];
  errorMessage: string | null;
  createdAt: string;
}

export interface GenerationJobRow {
  id: string;
  workspaceId: string;
  shotId: string | null;
  jobType: string;
  status: "PENDING" | "RUNNING" | "SUCCEEDED" | "FAILED" | "RETRYING" | "CANCELLED";
  queueName: string;
  queueJobId: string | null;
  relatedBatchType: string | null;
  relatedBatchId: string | null;
  payload: unknown;
  progress: number;
  attemptCount: number;
  maxAttempts: number;
  errorMessage: string | null;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface FinalVideoJobRow {
  id: string;
  workspaceId: string;
  shotSetId: string | null;
  status: "PENDING" | "RUNNING" | "SUCCEEDED" | "FAILED" | "CANCELLED";
  sourceShotVideoIds: string[];
  sourceVideoScriptArtifactIds: string[];
  localPath: string | null;
  localUrl: string | null;
  durationSec: number | null;
  width: number | null;
  height: number | null;
  compiledManifest: unknown;
  compiledManifestHash: string | null;
  ffmpegLog: string | null;
  errorMessage: string | null;
  idempotencyKey: string | null;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
}

export interface TraceEventRow {
  id: string;
  workspaceId: string;
  shotId: string | null;
  traceType:
    | "agent_run"
    | "provider_call"
    | "job_event"
    | "state_transition"
    | "user_action";
  name: string;
  inputPreview: string | null;
  outputPreview: string | null;
  metadata: unknown;
  createdAt: string;
}

export interface WorkspaceStorageBindingRow {
  id: string;
  workspaceId: string;
  kind: "LOCAL" | "S3";
  status: "ACTIVE" | "ARCHIVED";
  localPath: string | null;
  localPathNormalized: string | null;
  s3Bucket: string | null;
  s3Prefix: string | null;
  s3Region: string | null;
  s3Endpoint: string | null;
  metadata: unknown;
  createdAt: string;
  updatedAt: string;
}

// ─── v2 adapter interface ─────────────────────────────────────────────────────

export interface Db2Adapter {
  pool(): Pool;
  // Shots
  insertShot(
    input: Omit<StoryboardShotRow, "createdAt" | "updatedAt">
  ): Promise<StoryboardShotRow>;
  getShot(shotId: string): Promise<StoryboardShotRow>;
  listShotsByWorkspace(workspaceId: string): Promise<StoryboardShotRow[]>;
  updateShot(
    shotId: string,
    patch: Partial<StoryboardShotRow>
  ): Promise<StoryboardShotRow>;
  // Image prompt artifacts
  insertImagePromptArtifact(
    input: Omit<ImagePromptArtifactRow, "createdAt">
  ): Promise<ImagePromptArtifactRow>;
  getImagePromptArtifact(id: string): Promise<ImagePromptArtifactRow>;
  listImagePromptArtifacts(shotId: string): Promise<ImagePromptArtifactRow[]>;
  markImagePromptArtifactsStale(shotId: string): Promise<void>;
  // Image batches + candidates
  insertImageBatch(
    input: Omit<ImageGenerationBatchRow, "createdAt" | "updatedAt">
  ): Promise<ImageGenerationBatchRow>;
  getImageBatch(id: string): Promise<ImageGenerationBatchRow>;
  getLatestImageBatchForShot(shotId: string): Promise<ImageGenerationBatchRow | null>;
  getImageBatchByIdempotencyKey(key: string): Promise<ImageGenerationBatchRow | null>;
  updateImageBatch(
    id: string,
    patch: Partial<ImageGenerationBatchRow>
  ): Promise<ImageGenerationBatchRow>;
  insertImageCandidate(
    input: Omit<ImageCandidateRow, "createdAt">
  ): Promise<ImageCandidateRow>;
  updateImageCandidate(
    id: string,
    patch: Partial<ImageCandidateRow>
  ): Promise<ImageCandidateRow>;
  listImageCandidatesByBatch(batchId: string): Promise<ImageCandidateRow[]>;
  getImageCandidate(id: string): Promise<ImageCandidateRow>;
  // Selected images
  upsertSelectedImage(input: {
    shotId: string;
    imageCandidateId: string;
    imageGenerationBatchId: string;
    selectedBy?: string | null;
  }): Promise<void>;
  getSelectedImage(
    shotId: string
  ): Promise<{ imageCandidateId: string; imageGenerationBatchId: string } | null>;
  // Video script artifacts
  insertVideoScriptArtifact(
    input: Omit<VideoScriptArtifactRow, "createdAt">
  ): Promise<VideoScriptArtifactRow>;
  getVideoScriptArtifact(id: string): Promise<VideoScriptArtifactRow>;
  listVideoScriptArtifacts(shotId: string): Promise<VideoScriptArtifactRow[]>;
  markVideoScriptArtifactsStale(shotId: string): Promise<void>;
  // Video batches + candidates
  insertVideoBatch(
    input: Omit<VideoGenerationBatchRow, "createdAt" | "updatedAt">
  ): Promise<VideoGenerationBatchRow>;
  getVideoBatch(id: string): Promise<VideoGenerationBatchRow>;
  getLatestVideoBatchForShot(shotId: string): Promise<VideoGenerationBatchRow | null>;
  getVideoBatchByIdempotencyKey(key: string): Promise<VideoGenerationBatchRow | null>;
  updateVideoBatch(
    id: string,
    patch: Partial<VideoGenerationBatchRow>
  ): Promise<VideoGenerationBatchRow>;
  insertVideoCandidate(
    input: Omit<VideoCandidateRow, "createdAt">
  ): Promise<VideoCandidateRow>;
  updateVideoCandidate(
    id: string,
    patch: Partial<VideoCandidateRow>
  ): Promise<VideoCandidateRow>;
  listVideoCandidatesByBatch(batchId: string): Promise<VideoCandidateRow[]>;
  getVideoCandidate(id: string): Promise<VideoCandidateRow>;
  // Selected videos
  upsertSelectedVideo(input: {
    shotId: string;
    videoCandidateId: string;
    videoGenerationBatchId: string;
    selectedBy?: string | null;
  }): Promise<void>;
  getSelectedVideo(
    shotId: string
  ): Promise<{ videoCandidateId: string; videoGenerationBatchId: string } | null>;
  deleteSelectedVideo(shotId: string): Promise<void>;
  // Generation jobs
  insertGenerationJob(
    input: Omit<GenerationJobRow, "createdAt" | "updatedAt">
  ): Promise<GenerationJobRow>;
  getGenerationJob(id: string): Promise<GenerationJobRow>;
  updateGenerationJob(
    id: string,
    patch: Partial<GenerationJobRow>
  ): Promise<GenerationJobRow>;
  // Final video jobs
  insertFinalVideoJob(
    input: Omit<FinalVideoJobRow, "createdAt" | "updatedAt">
  ): Promise<FinalVideoJobRow>;
  getFinalVideoJob(id: string): Promise<FinalVideoJobRow>;
  getFinalVideoJobByIdempotencyKey(key: string): Promise<FinalVideoJobRow | null>;
  updateFinalVideoJob(
    id: string,
    patch: Partial<FinalVideoJobRow>
  ): Promise<FinalVideoJobRow>;
  // Trace events
  insertTraceEvent(input: Omit<TraceEventRow, "createdAt">): Promise<TraceEventRow>;
  listTraceEventsByWorkspace(
    workspaceId: string,
    opts: { limit?: number; cursor?: string }
  ): Promise<TraceEventRow[]>;
  listTraceEventsByShot(
    shotId: string,
    opts: { limit?: number; cursor?: string }
  ): Promise<TraceEventRow[]>;
}

// ─── v1 adapter interface (preserved) ────────────────────────────────────────

interface DbAdapter {
  initialize(): Promise<void>;
  close(): Promise<void>;
  createWorkspace(input: CreateWorkspaceInput): Promise<CreativeWorkspace>;
  listWorkspaces(limit?: number): Promise<CreativeWorkspace[]>;
  getWorkspace(workspaceId: string): Promise<CreativeWorkspace>;
  findWorkspaceByLocalPath(localPath: string): Promise<CreativeWorkspace | null>;
  getActiveWorkspaceStorage(
    workspaceId: string
  ): Promise<WorkspaceStorageBindingRow | null>;
  bindWorkspaceLocalStorage(input: {
    workspaceId: string;
    localPath: string;
    localPathNormalized: string;
  }): Promise<WorkspaceStorageBindingRow>;
  bindWorkspaceS3Storage(input: {
    workspaceId: string;
    bucket: string;
    prefix: string;
    region?: string | null;
    endpoint?: string | null;
  }): Promise<WorkspaceStorageBindingRow>;
  touchWorkspace(workspaceId: string): Promise<CreativeWorkspace>;
  updateWorkspace(
    workspaceId: string,
    patch: UpdateWorkspaceInput
  ): Promise<CreativeWorkspace>;
  upsertWorkspaceArtifact(
    input: UpsertWorkspaceArtifactInput
  ): Promise<WorkspaceArtifact>;
  getWorkspaceArtifact(
    workspaceId: string,
    artifactType: string
  ): Promise<WorkspaceArtifact>;
  createWorkspaceVideoArchive(
    input: CreateWorkspaceVideoArchiveInput
  ): Promise<WorkspaceVideoArchiveRecord>;
  getWorkspaceVideoArchiveByJob(
    jobId: string
  ): Promise<WorkspaceVideoArchiveRecord | null>;
  createProduct(input: CreateProductInput): Promise<Product>;
  getProduct(productId: string): Promise<Product>;
  updateProduct(productId: string, patch: Partial<Product>): Promise<Product>;
  createAsset(input: CreateAssetInput): Promise<Asset>;
  getAsset(assetId: string): Promise<Asset>;
  findProductImageAssetByUrl(url: string): Promise<Asset | null>;
  createJob(input: CreateJobInput): Promise<GenerationJob>;
  getJob(jobId: string): Promise<GenerationJob>;
  updateJob(jobId: string, patch: Partial<GenerationJob>): Promise<GenerationJob>;
  createScript(input: CreateScriptInput): Promise<Script>;
  getScript(scriptId: string): Promise<Script>;
  updateScript(scriptId: string, patch: Partial<Script>): Promise<Script>;
  freezeScript(scriptId: string): Promise<Script>;
  listShots(scriptId: string): Promise<StoryboardShot[]>;
  createShots(scriptId: string, shots: CreateShotInput[]): Promise<StoryboardShot[]>;
  replaceShots(scriptId: string, shots: CreateShotInput[]): Promise<StoryboardShot[]>;
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
      typeof row.main_image_asset_id === "string" ? row.main_image_asset_id : undefined,
    createdAt: toIsoString(row.created_at)
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
    createdAt: toIsoString(row.created_at)
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
    errorMessage: typeof row.error_message === "string" ? row.error_message : undefined,
    finalAssetId: typeof row.final_asset_id === "string" ? row.final_asset_id : undefined,
    scriptId: typeof row.script_id === "string" ? row.script_id : undefined,
    createdAt: toIsoString(row.created_at),
    updatedAt: toIsoString(row.updated_at)
  };
}

function toWorkspace(row: Record<string, unknown>): CreativeWorkspace {
  return {
    id: String(row.id),
    localPath: typeof row.local_path === "string" ? row.local_path : "",
    currentScriptId: String(row.current_script_id),
    currentJobId: typeof row.current_job_id === "string" ? row.current_job_id : undefined,
    status: row.status as CreativeWorkspace["status"],
    traceFile: String(row.trace_file),
    createdAt: toIsoString(row.created_at),
    updatedAt: toIsoString(row.updated_at),
    lastSeenAt: toIsoString(row.last_seen_at)
  };
}

function toWorkspaceStorageBinding(
  row: Record<string, unknown>
): WorkspaceStorageBindingRow {
  return {
    id: String(row.id),
    workspaceId: String(row.workspace_id),
    kind: row.kind as WorkspaceStorageBindingRow["kind"],
    status: row.status as WorkspaceStorageBindingRow["status"],
    localPath: typeof row.local_path === "string" ? row.local_path : null,
    localPathNormalized:
      typeof row.local_path_normalized === "string"
        ? row.local_path_normalized
        : null,
    s3Bucket: typeof row.s3_bucket === "string" ? row.s3_bucket : null,
    s3Prefix: typeof row.s3_prefix === "string" ? row.s3_prefix : null,
    s3Region: typeof row.s3_region === "string" ? row.s3_region : null,
    s3Endpoint: typeof row.s3_endpoint === "string" ? row.s3_endpoint : null,
    metadata:
      row.metadata && typeof row.metadata === "object" ? row.metadata : {},
    createdAt: toIsoString(row.created_at),
    updatedAt: toIsoString(row.updated_at),
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
    approvedAt: row.approved_at ? toIsoString(row.approved_at) : undefined
  };
}

function toWorkspaceVideoArchive(
  row: Record<string, unknown>
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
    createdAt: toIsoString(row.created_at)
  };
}

function toScript(row: Record<string, unknown>): Script {
  return {
    id: String(row.id),
    productId: String(row.product_id),
    jobId: typeof row.job_id === "string" ? row.job_id : undefined,
    parentScriptId:
      typeof row.parent_script_id === "string" ? row.parent_script_id : undefined,
    version: Number(row.version),
    narrative: String(row.narrative),
    visualStyle: String(row.visual_style),
    frozen: Boolean(row.frozen),
    frozenAt: row.frozen_at ? toIsoString(row.frozen_at) : undefined,
    rawJson: row.raw_json,
    createdAt: toIsoString(row.created_at)
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
    mediaAssetId: typeof row.media_asset_id === "string" ? row.media_asset_id : undefined,
    status: row.status as StoryboardShot["status"]
  };
}

function firstRow<T>(
  rows: Record<string, unknown>[],
  entityName: string,
  map: (row: Record<string, unknown>) => T
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

  getPool(): Pool {
    this.pool ??= new Pool({ connectionString: this.connectionString });
    return this.pool;
  }

  async createWorkspace(input: CreateWorkspaceInput): Promise<CreativeWorkspace> {
    const result = await this.getPool().query(
      `insert into creative_workspace
         (id, local_path, current_script_id, current_job_id, status, trace_file)
       values ($1, $2, $3, $4, $5, $6)
       returning *`,
      [
        input.id,
        input.localPath ?? null,
        input.currentScriptId,
        input.currentJobId ?? null,
        input.status,
        input.traceFile
      ]
    );
    const workspace = firstRow(result.rows, "CreativeWorkspace", toWorkspace);
    if (input.localPath) {
      await this.bindWorkspaceLocalStorage({
        workspaceId: workspace.id,
        localPath: input.localPath,
        localPathNormalized: input.localPath,
      });
    }
    return workspace;
  }

  async listWorkspaces(limit = 50): Promise<CreativeWorkspace[]> {
    const result = await this.getPool().query(
      `select *
       from creative_workspace
       order by last_seen_at desc, created_at desc
       limit $1`,
      [limit]
    );
    return result.rows.map(toWorkspace);
  }

  async getWorkspace(workspaceId: string): Promise<CreativeWorkspace> {
    const result = await this.getPool().query(
      "select * from creative_workspace where id = $1",
      [workspaceId]
    );
    return firstRow(result.rows, "CreativeWorkspace", toWorkspace);
  }

  async findWorkspaceByLocalPath(localPath: string): Promise<CreativeWorkspace | null> {
    const result = await this.getPool().query(
      `select cw.*
       from creative_workspace cw
       join workspace_storage_bindings wsb
         on wsb.workspace_id = cw.id
        and wsb.status = 'ACTIVE'
        and wsb.kind = 'LOCAL'
       where wsb.local_path_normalized = $1
       limit 1`,
      [localPath]
    );
    const row = result.rows[0];
    return row ? toWorkspace(row) : null;
  }

  async getActiveWorkspaceStorage(
    workspaceId: string
  ): Promise<WorkspaceStorageBindingRow | null> {
    const result = await this.getPool().query(
      `select *
       from workspace_storage_bindings
       where workspace_id = $1 and status = 'ACTIVE'
       limit 1`,
      [workspaceId]
    );
    const row = result.rows[0];
    return row ? toWorkspaceStorageBinding(row) : null;
  }

  async bindWorkspaceLocalStorage(input: {
    workspaceId: string;
    localPath: string;
    localPathNormalized: string;
  }): Promise<WorkspaceStorageBindingRow> {
    await this.getWorkspace(input.workspaceId);
    const existing = await this.getActiveWorkspaceStorage(input.workspaceId);
    if (existing) {
      if (
        existing.kind === "LOCAL" &&
        existing.localPathNormalized === input.localPathNormalized
      ) {
        return existing;
      }
      throw new Error("WORKSPACE_STORAGE_ALREADY_BOUND");
    }

    try {
      const result = await this.getPool().query(
        `insert into workspace_storage_bindings
           (id, workspace_id, kind, status, local_path, local_path_normalized)
         values ($1, $2, 'LOCAL', 'ACTIVE', $3, $4)
         returning *`,
        [nanoid(), input.workspaceId, input.localPath, input.localPathNormalized]
      );
      await this.getPool().query(
        `update creative_workspace
         set local_path = $2, updated_at = now(), last_seen_at = now()
         where id = $1`,
        [input.workspaceId, input.localPath]
      );
      return firstRow(
        result.rows,
        "WorkspaceStorageBinding",
        toWorkspaceStorageBinding
      );
    } catch (error) {
      if (
        typeof error === "object" &&
        error &&
        "code" in error &&
        error.code === "23505"
      ) {
        throw new Error("STORAGE_ALREADY_BOUND");
      }
      throw error;
    }
  }

  async bindWorkspaceS3Storage(input: {
    workspaceId: string;
    bucket: string;
    prefix: string;
    region?: string | null;
    endpoint?: string | null;
  }): Promise<WorkspaceStorageBindingRow> {
    await this.getWorkspace(input.workspaceId);
    const existing = await this.getActiveWorkspaceStorage(input.workspaceId);
    if (existing) {
      if (
        existing.kind === "S3" &&
        existing.s3Bucket === input.bucket &&
        existing.s3Prefix === input.prefix
      ) {
        return existing;
      }
      throw new Error("WORKSPACE_STORAGE_ALREADY_BOUND");
    }

    try {
      const result = await this.getPool().query(
        `insert into workspace_storage_bindings
           (id, workspace_id, kind, status, s3_bucket, s3_prefix, s3_region, s3_endpoint)
         values ($1, $2, 'S3', 'ACTIVE', $3, $4, $5, $6)
         returning *`,
        [
          nanoid(),
          input.workspaceId,
          input.bucket,
          input.prefix,
          input.region ?? null,
          input.endpoint ?? null,
        ]
      );
      return firstRow(
        result.rows,
        "WorkspaceStorageBinding",
        toWorkspaceStorageBinding
      );
    } catch (error) {
      if (
        typeof error === "object" &&
        error &&
        "code" in error &&
        error.code === "23505"
      ) {
        throw new Error("STORAGE_ALREADY_BOUND");
      }
      throw error;
    }
  }

  async touchWorkspace(workspaceId: string): Promise<CreativeWorkspace> {
    const result = await this.getPool().query(
      `update creative_workspace
       set last_seen_at = now(),
           updated_at = now()
       where id = $1
       returning *`,
      [workspaceId]
    );
    return firstRow(result.rows, "CreativeWorkspace", toWorkspace);
  }

  async updateWorkspace(
    workspaceId: string,
    patch: UpdateWorkspaceInput
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
        next.traceFile
      ]
    );
    return firstRow(result.rows, "CreativeWorkspace", toWorkspace);
  }

  async upsertWorkspaceArtifact(
    input: UpsertWorkspaceArtifactInput
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
        jsonbParam(input.data)
      ]
    );
    return firstRow(result.rows, "WorkspaceArtifact", toWorkspaceArtifact);
  }

  async getWorkspaceArtifact(
    workspaceId: string,
    artifactType: string
  ): Promise<WorkspaceArtifact> {
    const result = await this.getPool().query(
      `select *
       from workspace_artifact
       where workspace_id = $1 and artifact_type = $2`,
      [workspaceId, artifactType]
    );
    return firstRow(result.rows, "WorkspaceArtifact", toWorkspaceArtifact);
  }

  async createWorkspaceVideoArchive(
    input: CreateWorkspaceVideoArchiveInput
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
        input.archivedAt
      ]
    );
    return firstRow(result.rows, "WorkspaceVideoArchive", toWorkspaceVideoArchive);
  }

  async getWorkspaceVideoArchiveByJob(
    jobId: string
  ): Promise<WorkspaceVideoArchiveRecord | null> {
    const result = await this.getPool().query(
      `select *
       from workspace_video_archive
       where job_id = $1`,
      [jobId]
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
        input.mainImageAssetId ?? null
      ]
    );
    return firstRow(result.rows, "Product", toProduct);
  }

  async getProduct(productId: string): Promise<Product> {
    const result = await this.getPool().query("select * from product where id = $1", [
      productId
    ]);
    return firstRow(result.rows, "Product", toProduct);
  }

  async updateProduct(productId: string, patch: Partial<Product>): Promise<Product> {
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
        next.mainImageAssetId ?? null
      ]
    );
    return firstRow(result.rows, "Product", toProduct);
  }

  async createAsset(input: CreateAssetInput): Promise<Asset> {
    const result = await this.getPool().query(
      `insert into asset (id, type, url, source, metadata)
       values ($1, $2, $3, $4, $5)
       returning *`,
      [nanoid(), input.type, input.url, input.source, jsonbParam(input.metadata)]
    );
    return firstRow(result.rows, "Asset", toAsset);
  }

  async getAsset(assetId: string): Promise<Asset> {
    const result = await this.getPool().query("select * from asset where id = $1", [
      assetId
    ]);
    return firstRow(result.rows, "Asset", toAsset);
  }

  async findProductImageAssetByUrl(url: string): Promise<Asset | null> {
    const result = await this.getPool().query(
      `select *
       from asset
       where type = 'product_image' and url = $1
       order by created_at desc
       limit 1`,
      [url]
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
      [nanoid(), input.productId, input.scriptId ?? null, jsonbParam(input.payload)]
    );
    return firstRow(result.rows, "GenerationJob", toGenerationJob);
  }

  async getJob(jobId: string): Promise<GenerationJob> {
    const result = await this.getPool().query(
      "select * from generation_job where id = $1",
      [jobId]
    );
    return firstRow(result.rows, "GenerationJob", toGenerationJob);
  }

  async updateJob(jobId: string, patch: Partial<GenerationJob>): Promise<GenerationJob> {
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
        next.scriptId ?? null
      ]
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
        jsonbParam(input.rawJson)
      ]
    );
    return firstRow(result.rows, "Script", toScript);
  }

  async getScript(scriptId: string): Promise<Script> {
    const result = await this.getPool().query("select * from script where id = $1", [
      scriptId
    ]);
    return firstRow(result.rows, "Script", toScript);
  }

  async updateScript(scriptId: string, patch: Partial<Script>): Promise<Script> {
    const script = await this.getScript(scriptId);
    const next = {
      ...script,
      ...patch,
      id: script.id,
      productId: script.productId,
      version: script.version,
      createdAt: script.createdAt
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
        jsonbParam(next.rawJson)
      ]
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
      [scriptId]
    );
    return firstRow(result.rows, "Script", toScript);
  }

  async listShots(scriptId: string): Promise<StoryboardShot[]> {
    const result = await this.getPool().query(
      "select * from storyboard_shot where script_id = $1 order by shot_index",
      [scriptId]
    );
    return result.rows.map(toStoryboardShot);
  }

  async createShots(
    scriptId: string,
    shots: CreateShotInput[]
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
    shots: CreateShotInput[]
  ): Promise<StoryboardShot[]> {
    const client = await this.getPool().connect();
    try {
      await client.query("begin");
      await client.query("delete from storyboard_shot where script_id = $1", [scriptId]);
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
    shots: CreateShotInput[]
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
          shot.status
        ]
      );
      created.push(firstRow(result.rows, "StoryboardShot", toStoryboardShot));
    }
    return created;
  }
}

// ─── v2 row mappers ───────────────────────────────────────────────────────────

function toStoryboardShotRow(row: Record<string, unknown>): StoryboardShotRow {
  return {
    id: String(row.id),
    workspaceId: String(row.workspace_id),
    scriptId: String(row.script_id),
    orderIndex: Number(row.order_index),
    title: String(row.title),
    objective: typeof row.objective === "string" ? row.objective : null,
    defaultDurationSec:
      row.default_duration_sec != null ? Number(row.default_duration_sec) : null,
    status: String(row.status),
    nextAction: typeof row.next_action === "string" ? row.next_action : null,
    activeImagePromptArtifactId:
      typeof row.active_image_prompt_artifact_id === "string"
        ? row.active_image_prompt_artifact_id
        : null,
    selectedImageId:
      typeof row.selected_image_id === "string" ? row.selected_image_id : null,
    activeVideoScriptArtifactId:
      typeof row.active_video_script_artifact_id === "string"
        ? row.active_video_script_artifact_id
        : null,
    selectedVideoId:
      typeof row.selected_video_id === "string" ? row.selected_video_id : null,
    lastError: typeof row.last_error === "string" ? row.last_error : null,
    createdAt: toIsoString(row.created_at),
    updatedAt: toIsoString(row.updated_at)
  };
}

function toImagePromptArtifactRow(row: Record<string, unknown>): ImagePromptArtifactRow {
  return {
    id: String(row.id),
    shotId: String(row.shot_id),
    version: Number(row.version),
    status: row.status as ImagePromptArtifactRow["status"],
    promptText: String(row.prompt_text),
    negativePrompt: typeof row.negative_prompt === "string" ? row.negative_prompt : null,
    referenceAssetIds: Array.isArray(row.reference_asset_ids)
      ? (row.reference_asset_ids as string[])
      : [],
    promptJson: row.prompt_json,
    sourceFingerprint: row.source_fingerprint ?? {},
    promptAssembly: row.prompt_assembly ?? {},
    createdBy: String(row.created_by),
    agentName: typeof row.agent_name === "string" ? row.agent_name : null,
    promptTemplateVersion:
      typeof row.prompt_template_version === "string"
        ? row.prompt_template_version
        : null,
    baseArtifactId:
      typeof row.base_artifact_id === "string" ? row.base_artifact_id : null,
    createdAt: toIsoString(row.created_at)
  };
}

function toImageGenerationBatchRow(
  row: Record<string, unknown>
): ImageGenerationBatchRow {
  return {
    id: String(row.id),
    workspaceId: String(row.workspace_id),
    shotId: String(row.shot_id),
    imagePromptArtifactId: String(row.image_prompt_artifact_id),
    status: row.status as ImageGenerationBatchRow["status"],
    requestedCount: Number(row.requested_count),
    succeededCount: Number(row.succeeded_count),
    failedCount: Number(row.failed_count),
    provider: String(row.provider),
    aspectRatio: String(row.aspect_ratio),
    providerRequest: row.provider_request,
    errorMessage: typeof row.error_message === "string" ? row.error_message : null,
    idempotencyKey: typeof row.idempotency_key === "string" ? row.idempotency_key : null,
    createdAt: toIsoString(row.created_at),
    updatedAt: toIsoString(row.updated_at)
  };
}

function toImageCandidateRow(row: Record<string, unknown>): ImageCandidateRow {
  return {
    id: String(row.id),
    batchId: String(row.batch_id),
    workspaceId: String(row.workspace_id),
    shotId: String(row.shot_id),
    imageUrl: typeof row.image_url === "string" ? row.image_url : null,
    objectKey: typeof row.object_key === "string" ? row.object_key : null,
    width: row.width != null ? Number(row.width) : null,
    height: row.height != null ? Number(row.height) : null,
    seed: typeof row.seed === "string" ? row.seed : null,
    provider: String(row.provider),
    providerResponse: row.provider_response,
    status: row.status as ImageCandidateRow["status"],
    errorMessage: typeof row.error_message === "string" ? row.error_message : null,
    createdAt: toIsoString(row.created_at)
  };
}

function toVideoScriptArtifactRow(row: Record<string, unknown>): VideoScriptArtifactRow {
  return {
    id: String(row.id),
    shotId: String(row.shot_id),
    version: Number(row.version),
    status: row.status as VideoScriptArtifactRow["status"],
    durationSec: Number(row.duration_sec),
    scriptJson: row.script_json,
    providerPrompt: String(row.provider_prompt),
    basedOnImageCandidateId: String(row.based_on_image_candidate_id),
    basedOnPrevImageCandidateId:
      typeof row.based_on_prev_image_candidate_id === "string"
        ? row.based_on_prev_image_candidate_id
        : null,
    basedOnNextImageCandidateId:
      typeof row.based_on_next_image_candidate_id === "string"
        ? row.based_on_next_image_candidate_id
        : null,
    sourceFingerprint: row.source_fingerprint ?? {},
    promptAssembly: row.prompt_assembly ?? {},
    createdBy: String(row.created_by),
    agentName: typeof row.agent_name === "string" ? row.agent_name : null,
    promptTemplateVersion:
      typeof row.prompt_template_version === "string"
        ? row.prompt_template_version
        : null,
    baseArtifactId:
      typeof row.base_artifact_id === "string" ? row.base_artifact_id : null,
    createdAt: toIsoString(row.created_at)
  };
}

function toVideoGenerationBatchRow(
  row: Record<string, unknown>
): VideoGenerationBatchRow {
  return {
    id: String(row.id),
    workspaceId: String(row.workspace_id),
    shotId: String(row.shot_id),
    videoScriptArtifactId: String(row.video_script_artifact_id),
    status: row.status as VideoGenerationBatchRow["status"],
    requestedCount: Number(row.requested_count),
    succeededCount: Number(row.succeeded_count),
    failedCount: Number(row.failed_count),
    provider: String(row.provider),
    aspectRatio: String(row.aspect_ratio),
    providerRequest: row.provider_request,
    errorMessage: typeof row.error_message === "string" ? row.error_message : null,
    idempotencyKey: typeof row.idempotency_key === "string" ? row.idempotency_key : null,
    createdAt: toIsoString(row.created_at),
    updatedAt: toIsoString(row.updated_at)
  };
}

function toVideoCandidateRow(row: Record<string, unknown>): VideoCandidateRow {
  return {
    id: String(row.id),
    batchId: String(row.batch_id),
    workspaceId: String(row.workspace_id),
    shotId: String(row.shot_id),
    videoUrl: typeof row.video_url === "string" ? row.video_url : null,
    objectKey: typeof row.object_key === "string" ? row.object_key : null,
    thumbnailUrl: typeof row.thumbnail_url === "string" ? row.thumbnail_url : null,
    durationSec: row.duration_sec != null ? Number(row.duration_sec) : null,
    width: row.width != null ? Number(row.width) : null,
    height: row.height != null ? Number(row.height) : null,
    provider: String(row.provider),
    providerResponse: row.provider_response,
    status: row.status as VideoCandidateRow["status"],
    errorMessage: typeof row.error_message === "string" ? row.error_message : null,
    createdAt: toIsoString(row.created_at)
  };
}

function toGenerationJobRow(row: Record<string, unknown>): GenerationJobRow {
  return {
    id: String(row.id),
    workspaceId: String(row.workspace_id),
    shotId: typeof row.shot_id === "string" ? row.shot_id : null,
    jobType: String(row.job_type),
    status: row.status as GenerationJobRow["status"],
    queueName: String(row.queue_name),
    queueJobId: typeof row.queue_job_id === "string" ? row.queue_job_id : null,
    relatedBatchType:
      typeof row.related_batch_type === "string" ? row.related_batch_type : null,
    relatedBatchId:
      typeof row.related_batch_id === "string" ? row.related_batch_id : null,
    payload: row.payload,
    progress: Number(row.progress),
    attemptCount: Number(row.attempt_count),
    maxAttempts: Number(row.max_attempts),
    errorMessage: typeof row.error_message === "string" ? row.error_message : null,
    startedAt: row.started_at ? toIsoString(row.started_at) : null,
    completedAt: row.completed_at ? toIsoString(row.completed_at) : null,
    createdAt: toIsoString(row.created_at),
    updatedAt: toIsoString(row.updated_at)
  };
}

function toFinalVideoJobRow(row: Record<string, unknown>): FinalVideoJobRow {
  return {
    id: String(row.id),
    workspaceId: String(row.workspace_id),
    shotSetId: typeof row.shot_set_id === "string" ? row.shot_set_id : null,
    status: row.status as FinalVideoJobRow["status"],
    sourceShotVideoIds: Array.isArray(row.source_shot_video_ids)
      ? (row.source_shot_video_ids as string[])
      : [],
    sourceVideoScriptArtifactIds: Array.isArray(row.source_video_script_artifact_ids)
      ? (row.source_video_script_artifact_ids as string[])
      : [],
    localPath: typeof row.local_path === "string" ? row.local_path : null,
    localUrl: typeof row.local_url === "string" ? row.local_url : null,
    durationSec: row.duration_sec != null ? Number(row.duration_sec) : null,
    width: row.width != null ? Number(row.width) : null,
    height: row.height != null ? Number(row.height) : null,
    compiledManifest: row.compiled_manifest,
    compiledManifestHash:
      typeof row.compiled_manifest_hash === "string" ? row.compiled_manifest_hash : null,
    ffmpegLog: typeof row.ffmpeg_log === "string" ? row.ffmpeg_log : null,
    errorMessage: typeof row.error_message === "string" ? row.error_message : null,
    idempotencyKey: typeof row.idempotency_key === "string" ? row.idempotency_key : null,
    createdAt: toIsoString(row.created_at),
    updatedAt: toIsoString(row.updated_at),
    completedAt: row.completed_at ? toIsoString(row.completed_at) : null
  };
}

function toTraceEventRow(row: Record<string, unknown>): TraceEventRow {
  return {
    id: String(row.id),
    workspaceId: String(row.workspace_id),
    shotId: typeof row.shot_id === "string" ? row.shot_id : null,
    traceType: row.trace_type as TraceEventRow["traceType"],
    name: String(row.name),
    inputPreview: typeof row.input_preview === "string" ? row.input_preview : null,
    outputPreview: typeof row.output_preview === "string" ? row.output_preview : null,
    metadata: row.metadata,
    createdAt: toIsoString(row.created_at)
  };
}

// ─── PostgresDb2Adapter ───────────────────────────────────────────────────────

class PostgresDb2Adapter implements Db2Adapter {
  constructor(private readonly _pool: Pool) {}

  pool(): Pool {
    return this._pool;
  }

  // ── Shots ──────────────────────────────────────────────────────────────────

  async insertShot(
    input: Omit<StoryboardShotRow, "createdAt" | "updatedAt">
  ): Promise<StoryboardShotRow> {
    const result = await this._pool.query(
      `insert into storyboard_shots
         (id, workspace_id, script_id, order_index, title, objective, default_duration_sec,
          status, next_action, active_image_prompt_artifact_id, selected_image_id,
          active_video_script_artifact_id, selected_video_id, last_error)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
       returning *`,
      [
        input.id,
        input.workspaceId,
        input.scriptId,
        input.orderIndex,
        input.title,
        input.objective ?? null,
        input.defaultDurationSec ?? null,
        input.status,
        input.nextAction ?? null,
        input.activeImagePromptArtifactId ?? null,
        input.selectedImageId ?? null,
        input.activeVideoScriptArtifactId ?? null,
        input.selectedVideoId ?? null,
        input.lastError ?? null
      ]
    );
    return firstRow(result.rows, "StoryboardShot", toStoryboardShotRow);
  }

  async getShot(shotId: string): Promise<StoryboardShotRow> {
    const result = await this._pool.query(
      "select * from storyboard_shots where id = $1",
      [shotId]
    );
    return firstRow(result.rows, "StoryboardShot", toStoryboardShotRow);
  }

  async listShotsByWorkspace(workspaceId: string): Promise<StoryboardShotRow[]> {
    const result = await this._pool.query(
      "select * from storyboard_shots where workspace_id = $1 order by order_index",
      [workspaceId]
    );
    return result.rows.map(toStoryboardShotRow);
  }

  async updateShot(
    shotId: string,
    patch: Partial<StoryboardShotRow>
  ): Promise<StoryboardShotRow> {
    const colMap: Record<string, string> = {
      workspaceId: "workspace_id",
      scriptId: "script_id",
      orderIndex: "order_index",
      title: "title",
      objective: "objective",
      defaultDurationSec: "default_duration_sec",
      status: "status",
      nextAction: "next_action",
      activeImagePromptArtifactId: "active_image_prompt_artifact_id",
      selectedImageId: "selected_image_id",
      activeVideoScriptArtifactId: "active_video_script_artifact_id",
      selectedVideoId: "selected_video_id",
      lastError: "last_error"
    };
    const keys = Object.keys(patch).filter((k) => k in colMap);
    if (keys.length === 0) {
      return this.getShot(shotId);
    }
    const setClauses = keys.map((k, i) => `${colMap[k]} = $${i + 2}`);
    const values = keys.map((k) => (patch as Record<string, unknown>)[k]);
    const result = await this._pool.query(
      `update storyboard_shots
       set ${setClauses.join(", ")}, updated_at = now()
       where id = $1
       returning *`,
      [shotId, ...values]
    );
    return firstRow(result.rows, "StoryboardShot", toStoryboardShotRow);
  }

  // ── Image prompt artifacts ─────────────────────────────────────────────────

  async insertImagePromptArtifact(
    input: Omit<ImagePromptArtifactRow, "createdAt">
  ): Promise<ImagePromptArtifactRow> {
    const result = await this._pool.query(
      `insert into image_prompt_artifacts
         (id, shot_id, version, status, prompt_text, negative_prompt, reference_asset_ids,
          prompt_json, source_fingerprint, prompt_assembly, created_by, agent_name,
          prompt_template_version, base_artifact_id)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
       returning *`,
      [
        input.id,
        input.shotId,
        input.version,
        input.status,
        input.promptText,
        input.negativePrompt ?? null,
        input.referenceAssetIds,
        jsonbParam(input.promptJson),
        jsonbParam(input.sourceFingerprint),
        jsonbParam(input.promptAssembly),
        input.createdBy,
        input.agentName ?? null,
        input.promptTemplateVersion ?? null,
        input.baseArtifactId ?? null
      ]
    );
    return firstRow(result.rows, "ImagePromptArtifact", toImagePromptArtifactRow);
  }

  async getImagePromptArtifact(id: string): Promise<ImagePromptArtifactRow> {
    const result = await this._pool.query(
      "select * from image_prompt_artifacts where id = $1",
      [id]
    );
    return firstRow(result.rows, "ImagePromptArtifact", toImagePromptArtifactRow);
  }

  async listImagePromptArtifacts(shotId: string): Promise<ImagePromptArtifactRow[]> {
    const result = await this._pool.query(
      "select * from image_prompt_artifacts where shot_id = $1 order by version desc",
      [shotId]
    );
    return result.rows.map(toImagePromptArtifactRow);
  }

  async markImagePromptArtifactsStale(shotId: string): Promise<void> {
    await this._pool.query(
      `update image_prompt_artifacts set status = 'STALE'
       where shot_id = $1 and status in ('DRAFT','ACTIVE','APPROVED')`,
      [shotId]
    );
  }

  // ── Image batches ──────────────────────────────────────────────────────────

  async insertImageBatch(
    input: Omit<ImageGenerationBatchRow, "createdAt" | "updatedAt">
  ): Promise<ImageGenerationBatchRow> {
    const result = await this._pool.query(
      `insert into image_generation_batches
         (id, workspace_id, shot_id, image_prompt_artifact_id, status, requested_count,
          succeeded_count, failed_count, provider, aspect_ratio, provider_request,
          error_message, idempotency_key)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
       returning *`,
      [
        input.id,
        input.workspaceId,
        input.shotId,
        input.imagePromptArtifactId,
        input.status,
        input.requestedCount,
        input.succeededCount,
        input.failedCount,
        input.provider,
        input.aspectRatio,
        jsonbParam(input.providerRequest),
        input.errorMessage ?? null,
        input.idempotencyKey ?? null
      ]
    );
    return firstRow(result.rows, "ImageGenerationBatch", toImageGenerationBatchRow);
  }

  async getImageBatch(id: string): Promise<ImageGenerationBatchRow> {
    const result = await this._pool.query(
      "select * from image_generation_batches where id = $1",
      [id]
    );
    return firstRow(result.rows, "ImageGenerationBatch", toImageGenerationBatchRow);
  }

  async getLatestImageBatchForShot(
    shotId: string
  ): Promise<ImageGenerationBatchRow | null> {
    const result = await this._pool.query(
      `select * from image_generation_batches
       where shot_id = $1
       order by created_at desc, id desc
       limit 1`,
      [shotId]
    );
    const row = result.rows[0];
    return row ? toImageGenerationBatchRow(row) : null;
  }

  async getImageBatchByIdempotencyKey(
    key: string
  ): Promise<ImageGenerationBatchRow | null> {
    const result = await this._pool.query(
      "select * from image_generation_batches where idempotency_key = $1",
      [key]
    );
    const row = result.rows[0];
    return row ? toImageGenerationBatchRow(row) : null;
  }

  async updateImageBatch(
    id: string,
    patch: Partial<ImageGenerationBatchRow>
  ): Promise<ImageGenerationBatchRow> {
    const colMap: Record<string, string> = {
      status: "status",
      requestedCount: "requested_count",
      succeededCount: "succeeded_count",
      failedCount: "failed_count",
      provider: "provider",
      aspectRatio: "aspect_ratio",
      providerRequest: "provider_request",
      errorMessage: "error_message",
      idempotencyKey: "idempotency_key"
    };
    const keys = Object.keys(patch).filter((k) => k in colMap);
    if (keys.length === 0) {
      return this.getImageBatch(id);
    }
    const setClauses = keys.map((k, i) => `${colMap[k]} = $${i + 2}`);
    const values = keys.map((k) => {
      const v = (patch as Record<string, unknown>)[k];
      return k === "providerRequest" ? jsonbParam(v) : v;
    });
    const result = await this._pool.query(
      `update image_generation_batches
       set ${setClauses.join(", ")}, updated_at = now()
       where id = $1
       returning *`,
      [id, ...values]
    );
    return firstRow(result.rows, "ImageGenerationBatch", toImageGenerationBatchRow);
  }

  // ── Image candidates ───────────────────────────────────────────────────────

  async insertImageCandidate(
    input: Omit<ImageCandidateRow, "createdAt">
  ): Promise<ImageCandidateRow> {
    const result = await this._pool.query(
      `insert into image_candidates
         (id, batch_id, workspace_id, shot_id, image_url, object_key, width, height,
          seed, provider, provider_response, status, error_message)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
       returning *`,
      [
        input.id,
        input.batchId,
        input.workspaceId,
        input.shotId,
        input.imageUrl ?? null,
        input.objectKey ?? null,
        input.width ?? null,
        input.height ?? null,
        input.seed ?? null,
        input.provider,
        jsonbParam(input.providerResponse),
        input.status,
        input.errorMessage ?? null
      ]
    );
    return firstRow(result.rows, "ImageCandidate", toImageCandidateRow);
  }

  async updateImageCandidate(
    id: string,
    patch: Partial<ImageCandidateRow>
  ): Promise<ImageCandidateRow> {
    const colMap: Record<string, string> = {
      imageUrl: "image_url",
      objectKey: "object_key",
      width: "width",
      height: "height",
      seed: "seed",
      provider: "provider",
      providerResponse: "provider_response",
      status: "status",
      errorMessage: "error_message"
    };
    const keys = Object.keys(patch).filter((k) => k in colMap);
    if (keys.length === 0) {
      return this.getImageCandidate(id);
    }
    const setClauses = keys.map((k, i) => `${colMap[k]} = $${i + 2}`);
    const values = keys.map((k) => {
      const v = (patch as Record<string, unknown>)[k];
      return k === "providerResponse" ? jsonbParam(v) : v;
    });
    const result = await this._pool.query(
      `update image_candidates
       set ${setClauses.join(", ")}
       where id = $1
       returning *`,
      [id, ...values]
    );
    return firstRow(result.rows, "ImageCandidate", toImageCandidateRow);
  }

  async listImageCandidatesByBatch(batchId: string): Promise<ImageCandidateRow[]> {
    const result = await this._pool.query(
      "select * from image_candidates where batch_id = $1 order by created_at",
      [batchId]
    );
    return result.rows.map(toImageCandidateRow);
  }

  async getImageCandidate(id: string): Promise<ImageCandidateRow> {
    const result = await this._pool.query(
      "select * from image_candidates where id = $1",
      [id]
    );
    return firstRow(result.rows, "ImageCandidate", toImageCandidateRow);
  }

  // ── Selected images ────────────────────────────────────────────────────────

  async upsertSelectedImage(input: {
    shotId: string;
    imageCandidateId: string;
    imageGenerationBatchId: string;
    selectedBy?: string | null;
  }): Promise<void> {
    const result = await this._pool.query(
      `insert into image_select_artifacts
         (id, workspace_id, shot_set_id, shot_id, image_candidate_id,
          image_generation_batch_id, selected_by)
       select $1, s.workspace_id, s.shot_set_id, s.id, $3, $4, $5
       from storyboard_shots s
       where s.id = $2
         and s.shot_set_id is not null
       on conflict (shot_id) do update
       set image_candidate_id = excluded.image_candidate_id,
           image_generation_batch_id = excluded.image_generation_batch_id,
           workspace_id = excluded.workspace_id,
           shot_set_id = excluded.shot_set_id,
           selected_by = excluded.selected_by,
           selected_at = now(),
           updated_at = now()
       returning id`,
      [
        "sel_img_" + nanoid(10),
        input.shotId,
        input.imageCandidateId,
        input.imageGenerationBatchId,
        input.selectedBy ?? null
      ]
    );
    if (result.rowCount !== 1) {
      throw new NotFoundError("ActiveShotSet");
    }
  }

  async getSelectedImage(
    shotId: string
  ): Promise<{ imageCandidateId: string; imageGenerationBatchId: string } | null> {
    const result = await this._pool.query(
      "select * from image_select_artifacts where shot_id = $1",
      [shotId]
    );
    const row = result.rows[0];
    if (!row) return null;
    return {
      imageCandidateId: String(row.image_candidate_id),
      imageGenerationBatchId: String(row.image_generation_batch_id)
    };
  }

  // ── Video script artifacts ─────────────────────────────────────────────────

  async insertVideoScriptArtifact(
    input: Omit<VideoScriptArtifactRow, "createdAt">
  ): Promise<VideoScriptArtifactRow> {
    const result = await this._pool.query(
      `insert into video_script_artifacts
         (id, shot_id, version, status, duration_sec, script_json, provider_prompt,
          based_on_image_candidate_id, based_on_prev_image_candidate_id,
          based_on_next_image_candidate_id, source_fingerprint, prompt_assembly,
          created_by, agent_name,
          prompt_template_version, base_artifact_id)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
       returning *`,
      [
        input.id,
        input.shotId,
        input.version,
        input.status,
        input.durationSec,
        jsonbParam(input.scriptJson),
        input.providerPrompt,
        input.basedOnImageCandidateId,
        input.basedOnPrevImageCandidateId ?? null,
        input.basedOnNextImageCandidateId ?? null,
        jsonbParam(input.sourceFingerprint),
        jsonbParam(input.promptAssembly),
        input.createdBy,
        input.agentName ?? null,
        input.promptTemplateVersion ?? null,
        input.baseArtifactId ?? null
      ]
    );
    return firstRow(result.rows, "VideoScriptArtifact", toVideoScriptArtifactRow);
  }

  async getVideoScriptArtifact(id: string): Promise<VideoScriptArtifactRow> {
    const result = await this._pool.query(
      "select * from video_script_artifacts where id = $1",
      [id]
    );
    return firstRow(result.rows, "VideoScriptArtifact", toVideoScriptArtifactRow);
  }

  async listVideoScriptArtifacts(shotId: string): Promise<VideoScriptArtifactRow[]> {
    const result = await this._pool.query(
      "select * from video_script_artifacts where shot_id = $1 order by version desc",
      [shotId]
    );
    return result.rows.map(toVideoScriptArtifactRow);
  }

  async markVideoScriptArtifactsStale(shotId: string): Promise<void> {
    await this._pool.query(
      `update video_script_artifacts set status = 'STALE'
       where shot_id = $1 and status in ('DRAFT','ACTIVE','APPROVED')`,
      [shotId]
    );
  }

  // ── Video batches ──────────────────────────────────────────────────────────

  async insertVideoBatch(
    input: Omit<VideoGenerationBatchRow, "createdAt" | "updatedAt">
  ): Promise<VideoGenerationBatchRow> {
    const result = await this._pool.query(
      `insert into video_generation_batches
         (id, workspace_id, shot_id, video_script_artifact_id, status, requested_count,
          succeeded_count, failed_count, provider, aspect_ratio, provider_request,
          error_message, idempotency_key)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
       returning *`,
      [
        input.id,
        input.workspaceId,
        input.shotId,
        input.videoScriptArtifactId,
        input.status,
        input.requestedCount,
        input.succeededCount,
        input.failedCount,
        input.provider,
        input.aspectRatio,
        jsonbParam(input.providerRequest),
        input.errorMessage ?? null,
        input.idempotencyKey ?? null
      ]
    );
    return firstRow(result.rows, "VideoGenerationBatch", toVideoGenerationBatchRow);
  }

  async getVideoBatch(id: string): Promise<VideoGenerationBatchRow> {
    const result = await this._pool.query(
      "select * from video_generation_batches where id = $1",
      [id]
    );
    return firstRow(result.rows, "VideoGenerationBatch", toVideoGenerationBatchRow);
  }

  async getLatestVideoBatchForShot(
    shotId: string
  ): Promise<VideoGenerationBatchRow | null> {
    const result = await this._pool.query(
      `select * from video_generation_batches
       where shot_id = $1
       order by created_at desc, id desc
       limit 1`,
      [shotId]
    );
    const row = result.rows[0];
    return row ? toVideoGenerationBatchRow(row) : null;
  }

  async getVideoBatchByIdempotencyKey(
    key: string
  ): Promise<VideoGenerationBatchRow | null> {
    const result = await this._pool.query(
      "select * from video_generation_batches where idempotency_key = $1",
      [key]
    );
    const row = result.rows[0];
    return row ? toVideoGenerationBatchRow(row) : null;
  }

  async updateVideoBatch(
    id: string,
    patch: Partial<VideoGenerationBatchRow>
  ): Promise<VideoGenerationBatchRow> {
    const colMap: Record<string, string> = {
      status: "status",
      requestedCount: "requested_count",
      succeededCount: "succeeded_count",
      failedCount: "failed_count",
      provider: "provider",
      aspectRatio: "aspect_ratio",
      providerRequest: "provider_request",
      errorMessage: "error_message",
      idempotencyKey: "idempotency_key"
    };
    const keys = Object.keys(patch).filter((k) => k in colMap);
    if (keys.length === 0) {
      return this.getVideoBatch(id);
    }
    const setClauses = keys.map((k, i) => `${colMap[k]} = $${i + 2}`);
    const values = keys.map((k) => {
      const v = (patch as Record<string, unknown>)[k];
      return k === "providerRequest" ? jsonbParam(v) : v;
    });
    const result = await this._pool.query(
      `update video_generation_batches
       set ${setClauses.join(", ")}, updated_at = now()
       where id = $1
       returning *`,
      [id, ...values]
    );
    return firstRow(result.rows, "VideoGenerationBatch", toVideoGenerationBatchRow);
  }

  // ── Video candidates ───────────────────────────────────────────────────────

  async insertVideoCandidate(
    input: Omit<VideoCandidateRow, "createdAt">
  ): Promise<VideoCandidateRow> {
    const result = await this._pool.query(
      `insert into video_candidates
         (id, batch_id, workspace_id, shot_id, video_url, object_key, thumbnail_url,
          duration_sec, width, height, provider, provider_response, status, error_message)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
       returning *`,
      [
        input.id,
        input.batchId,
        input.workspaceId,
        input.shotId,
        input.videoUrl ?? null,
        input.objectKey ?? null,
        input.thumbnailUrl ?? null,
        input.durationSec ?? null,
        input.width ?? null,
        input.height ?? null,
        input.provider,
        jsonbParam(input.providerResponse),
        input.status,
        input.errorMessage ?? null
      ]
    );
    return firstRow(result.rows, "VideoCandidate", toVideoCandidateRow);
  }

  async updateVideoCandidate(
    id: string,
    patch: Partial<VideoCandidateRow>
  ): Promise<VideoCandidateRow> {
    const colMap: Record<string, string> = {
      videoUrl: "video_url",
      objectKey: "object_key",
      thumbnailUrl: "thumbnail_url",
      durationSec: "duration_sec",
      width: "width",
      height: "height",
      provider: "provider",
      providerResponse: "provider_response",
      status: "status",
      errorMessage: "error_message"
    };
    const keys = Object.keys(patch).filter((k) => k in colMap);
    if (keys.length === 0) {
      return this.getVideoCandidate(id);
    }
    const setClauses = keys.map((k, i) => `${colMap[k]} = $${i + 2}`);
    const values = keys.map((k) => {
      const v = (patch as Record<string, unknown>)[k];
      return k === "providerResponse" ? jsonbParam(v) : v;
    });
    const result = await this._pool.query(
      `update video_candidates
       set ${setClauses.join(", ")}
       where id = $1
       returning *`,
      [id, ...values]
    );
    return firstRow(result.rows, "VideoCandidate", toVideoCandidateRow);
  }

  async listVideoCandidatesByBatch(batchId: string): Promise<VideoCandidateRow[]> {
    const result = await this._pool.query(
      "select * from video_candidates where batch_id = $1 order by created_at",
      [batchId]
    );
    return result.rows.map(toVideoCandidateRow);
  }

  async getVideoCandidate(id: string): Promise<VideoCandidateRow> {
    const result = await this._pool.query(
      "select * from video_candidates where id = $1",
      [id]
    );
    return firstRow(result.rows, "VideoCandidate", toVideoCandidateRow);
  }

  // ── Selected videos ────────────────────────────────────────────────────────

  async upsertSelectedVideo(input: {
    shotId: string;
    videoCandidateId: string;
    videoGenerationBatchId: string;
    selectedBy?: string | null;
  }): Promise<void> {
    const result = await this._pool.query(
      `insert into video_select_artifacts
         (id, workspace_id, shot_set_id, shot_id, video_candidate_id,
          video_generation_batch_id, selected_by)
       select $1, s.workspace_id, s.shot_set_id, s.id, $3, $4, $5
       from storyboard_shots s
       where s.id = $2
         and s.shot_set_id is not null
       on conflict (shot_id) do update
       set video_candidate_id = excluded.video_candidate_id,
           video_generation_batch_id = excluded.video_generation_batch_id,
           workspace_id = excluded.workspace_id,
           shot_set_id = excluded.shot_set_id,
           selected_by = excluded.selected_by,
           selected_at = now(),
           updated_at = now()
       returning id`,
      [
        "sel_vid_" + nanoid(10),
        input.shotId,
        input.videoCandidateId,
        input.videoGenerationBatchId,
        input.selectedBy ?? null
      ]
    );
    if (result.rowCount !== 1) {
      throw new NotFoundError("ActiveShotSet");
    }
  }

  async getSelectedVideo(
    shotId: string
  ): Promise<{ videoCandidateId: string; videoGenerationBatchId: string } | null> {
    const result = await this._pool.query(
      "select * from video_select_artifacts where shot_id = $1",
      [shotId]
    );
    const row = result.rows[0];
    if (!row) return null;
    return {
      videoCandidateId: String(row.video_candidate_id),
      videoGenerationBatchId: String(row.video_generation_batch_id)
    };
  }

  async deleteSelectedVideo(shotId: string): Promise<void> {
    await this._pool.query("delete from video_select_artifacts where shot_id = $1", [
      shotId
    ]);
  }

  // ── Generation jobs ────────────────────────────────────────────────────────

  async insertGenerationJob(
    input: Omit<GenerationJobRow, "createdAt" | "updatedAt">
  ): Promise<GenerationJobRow> {
    const result = await this._pool.query(
      `insert into generation_jobs
         (id, workspace_id, shot_id, job_type, status, queue_name, queue_job_id,
          related_batch_type, related_batch_id, payload, progress, attempt_count,
          max_attempts, error_message, started_at, completed_at)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
       returning *`,
      [
        input.id,
        input.workspaceId,
        input.shotId ?? null,
        input.jobType,
        input.status,
        input.queueName,
        input.queueJobId ?? null,
        input.relatedBatchType ?? null,
        input.relatedBatchId ?? null,
        jsonbParam(input.payload),
        input.progress,
        input.attemptCount,
        input.maxAttempts,
        input.errorMessage ?? null,
        input.startedAt ?? null,
        input.completedAt ?? null
      ]
    );
    return firstRow(result.rows, "GenerationJob", toGenerationJobRow);
  }

  async getGenerationJob(id: string): Promise<GenerationJobRow> {
    const result = await this._pool.query("select * from generation_jobs where id = $1", [
      id
    ]);
    return firstRow(result.rows, "GenerationJob", toGenerationJobRow);
  }

  async updateGenerationJob(
    id: string,
    patch: Partial<GenerationJobRow>
  ): Promise<GenerationJobRow> {
    const colMap: Record<string, string> = {
      status: "status",
      queueJobId: "queue_job_id",
      relatedBatchType: "related_batch_type",
      relatedBatchId: "related_batch_id",
      payload: "payload",
      progress: "progress",
      attemptCount: "attempt_count",
      maxAttempts: "max_attempts",
      errorMessage: "error_message",
      startedAt: "started_at",
      completedAt: "completed_at"
    };
    const keys = Object.keys(patch).filter((k) => k in colMap);
    if (keys.length === 0) {
      return this.getGenerationJob(id);
    }
    const setClauses = keys.map((k, i) => `${colMap[k]} = $${i + 2}`);
    const values = keys.map((k) => {
      const v = (patch as Record<string, unknown>)[k];
      return k === "payload" ? jsonbParam(v) : v;
    });
    const result = await this._pool.query(
      `update generation_jobs
       set ${setClauses.join(", ")}, updated_at = now()
       where id = $1
       returning *`,
      [id, ...values]
    );
    return firstRow(result.rows, "GenerationJob", toGenerationJobRow);
  }

  // ── Final video jobs ───────────────────────────────────────────────────────

  async insertFinalVideoJob(
    input: Omit<FinalVideoJobRow, "createdAt" | "updatedAt">
  ): Promise<FinalVideoJobRow> {
    const result = await this._pool.query(
      `insert into final_video_jobs
         (id, workspace_id, shot_set_id, status, source_shot_video_ids, source_video_script_artifact_ids,
          local_path, local_url, duration_sec, width, height, compiled_manifest,
          compiled_manifest_hash, ffmpeg_log, error_message, idempotency_key, completed_at)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
       returning *`,
      [
        input.id,
        input.workspaceId,
        input.shotSetId ?? null,
        input.status,
        input.sourceShotVideoIds,
        input.sourceVideoScriptArtifactIds,
        input.localPath ?? null,
        input.localUrl ?? null,
        input.durationSec ?? null,
        input.width ?? null,
        input.height ?? null,
        jsonbParam(input.compiledManifest),
        input.compiledManifestHash ?? null,
        input.ffmpegLog ?? null,
        input.errorMessage ?? null,
        input.idempotencyKey ?? null,
        input.completedAt ?? null
      ]
    );
    return firstRow(result.rows, "FinalVideoJob", toFinalVideoJobRow);
  }

  async getFinalVideoJob(id: string): Promise<FinalVideoJobRow> {
    const result = await this._pool.query(
      "select * from final_video_jobs where id = $1",
      [id]
    );
    return firstRow(result.rows, "FinalVideoJob", toFinalVideoJobRow);
  }

  async getFinalVideoJobByIdempotencyKey(key: string): Promise<FinalVideoJobRow | null> {
    const result = await this._pool.query(
      "select * from final_video_jobs where idempotency_key = $1",
      [key]
    );
    const row = result.rows[0];
    return row ? toFinalVideoJobRow(row) : null;
  }

  async updateFinalVideoJob(
    id: string,
    patch: Partial<FinalVideoJobRow>
  ): Promise<FinalVideoJobRow> {
    const colMap: Record<string, string> = {
      status: "status",
      shotSetId: "shot_set_id",
      sourceShotVideoIds: "source_shot_video_ids",
      sourceVideoScriptArtifactIds: "source_video_script_artifact_ids",
      localPath: "local_path",
      localUrl: "local_url",
      durationSec: "duration_sec",
      width: "width",
      height: "height",
      compiledManifest: "compiled_manifest",
      compiledManifestHash: "compiled_manifest_hash",
      ffmpegLog: "ffmpeg_log",
      errorMessage: "error_message",
      idempotencyKey: "idempotency_key",
      completedAt: "completed_at"
    };
    const keys = Object.keys(patch).filter((k) => k in colMap);
    if (keys.length === 0) {
      return this.getFinalVideoJob(id);
    }
    const setClauses = keys.map((k, i) => `${colMap[k]} = $${i + 2}`);
    const values = keys.map((k) => {
      const v = (patch as Record<string, unknown>)[k];
      return k === "compiledManifest" ? jsonbParam(v) : v;
    });
    const result = await this._pool.query(
      `update final_video_jobs
       set ${setClauses.join(", ")}, updated_at = now()
       where id = $1
       returning *`,
      [id, ...values]
    );
    return firstRow(result.rows, "FinalVideoJob", toFinalVideoJobRow);
  }

  // ── Trace events ───────────────────────────────────────────────────────────

  async insertTraceEvent(
    input: Omit<TraceEventRow, "createdAt">
  ): Promise<TraceEventRow> {
    const result = await this._pool.query(
      `insert into trace_events
         (id, workspace_id, shot_id, trace_type, name, input_preview, output_preview, metadata)
       values ($1,$2,$3,$4,$5,$6,$7,$8)
       returning *`,
      [
        input.id,
        input.workspaceId,
        input.shotId ?? null,
        input.traceType,
        input.name,
        input.inputPreview ?? null,
        input.outputPreview ?? null,
        jsonbParam(input.metadata)
      ]
    );
    return firstRow(result.rows, "TraceEvent", toTraceEventRow);
  }

  async listTraceEventsByWorkspace(
    workspaceId: string,
    opts: { limit?: number; cursor?: string }
  ): Promise<TraceEventRow[]> {
    const limit = opts.limit ?? 50;
    if (opts.cursor) {
      const result = await this._pool.query(
        `select * from trace_events
         where workspace_id = $1 and id < $2
         order by created_at desc, id desc
         limit $3`,
        [workspaceId, opts.cursor, limit]
      );
      return result.rows.map(toTraceEventRow);
    }
    const result = await this._pool.query(
      `select * from trace_events
       where workspace_id = $1
       order by created_at desc, id desc
       limit $2`,
      [workspaceId, limit]
    );
    return result.rows.map(toTraceEventRow);
  }

  async listTraceEventsByShot(
    shotId: string,
    opts: { limit?: number; cursor?: string }
  ): Promise<TraceEventRow[]> {
    const limit = opts.limit ?? 50;
    if (opts.cursor) {
      const result = await this._pool.query(
        `select * from trace_events
         where shot_id = $1 and id < $2
         order by created_at desc, id desc
         limit $3`,
        [shotId, opts.cursor, limit]
      );
      return result.rows.map(toTraceEventRow);
    }
    const result = await this._pool.query(
      `select * from trace_events
       where shot_id = $1
       order by created_at desc, id desc
       limit $2`,
      [shotId, limit]
    );
    return result.rows.map(toTraceEventRow);
  }
}

// ─── adapter singletons + exported db object ──────────────────────────────────

let v1: PostgresDbAdapter | undefined;
let v2: PostgresDb2Adapter | undefined;

function getV1(): DbAdapter {
  v1 ??= new PostgresDbAdapter(config.databaseUrl);
  return v1;
}

function getV2(): Db2Adapter {
  v1 ??= new PostgresDbAdapter(config.databaseUrl);
  // Reuse the existing pool from v1 to avoid opening a second connection pool.
  // v1 is always a PostgresDbAdapter here (the concrete class).
  v2 ??= new PostgresDb2Adapter((v1 as PostgresDbAdapter).getPool());
  return v2;
}

export const db: DbAdapter & { db2: Db2Adapter } = {
  initialize: () => getV1().initialize(),
  close: () => getV1().close(),
  createWorkspace: (input) => getV1().createWorkspace(input),
  listWorkspaces: (limit) => getV1().listWorkspaces(limit),
  getWorkspace: (workspaceId) => getV1().getWorkspace(workspaceId),
  findWorkspaceByLocalPath: (localPath) => getV1().findWorkspaceByLocalPath(localPath),
  getActiveWorkspaceStorage: (workspaceId) => getV1().getActiveWorkspaceStorage(workspaceId),
  bindWorkspaceLocalStorage: (input) => getV1().bindWorkspaceLocalStorage(input),
  bindWorkspaceS3Storage: (input) => getV1().bindWorkspaceS3Storage(input),
  touchWorkspace: (workspaceId) => getV1().touchWorkspace(workspaceId),
  updateWorkspace: (workspaceId, patch) => getV1().updateWorkspace(workspaceId, patch),
  upsertWorkspaceArtifact: (input) => getV1().upsertWorkspaceArtifact(input),
  getWorkspaceArtifact: (workspaceId, artifactType) =>
    getV1().getWorkspaceArtifact(workspaceId, artifactType),
  createWorkspaceVideoArchive: (input) => getV1().createWorkspaceVideoArchive(input),
  getWorkspaceVideoArchiveByJob: (jobId) => getV1().getWorkspaceVideoArchiveByJob(jobId),
  createProduct: (input) => getV1().createProduct(input),
  getProduct: (productId) => getV1().getProduct(productId),
  updateProduct: (productId, patch) => getV1().updateProduct(productId, patch),
  createAsset: (input) => getV1().createAsset(input),
  getAsset: (assetId) => getV1().getAsset(assetId),
  findProductImageAssetByUrl: (url) => getV1().findProductImageAssetByUrl(url),
  createJob: (input) => getV1().createJob(input),
  getJob: (jobId) => getV1().getJob(jobId),
  updateJob: (jobId, patch) => getV1().updateJob(jobId, patch),
  createScript: (input) => getV1().createScript(input),
  getScript: (scriptId) => getV1().getScript(scriptId),
  updateScript: (scriptId, patch) => getV1().updateScript(scriptId, patch),
  freezeScript: (scriptId) => getV1().freezeScript(scriptId),
  listShots: (scriptId) => getV1().listShots(scriptId),
  createShots: (scriptId, shots) => getV1().createShots(scriptId, shots),
  replaceShots: (scriptId, shots) => getV1().replaceShots(scriptId, shots),
  get db2() {
    return getV2();
  }
};
