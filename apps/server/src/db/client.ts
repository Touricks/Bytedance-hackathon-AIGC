import { Pool, type PoolClient } from "pg";
import { nanoid } from "nanoid";
import type {
  Asset,
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
type CreateScriptInput = Omit<Script, "id" | "createdAt"> &
  Partial<Pick<Script, "id">>;
type CreateShotInput = Omit<StoryboardShot, "id" | "scriptId">;

interface DbAdapter {
  initialize(): Promise<void>;
  close(): Promise<void>;
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
      typeof row.main_image_asset_id === "string"
        ? row.main_image_asset_id
        : undefined,
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
    errorMessage:
      typeof row.error_message === "string" ? row.error_message : undefined,
    finalAssetId:
      typeof row.final_asset_id === "string" ? row.final_asset_id : undefined,
    scriptId: typeof row.script_id === "string" ? row.script_id : undefined,
    createdAt: toIsoString(row.created_at),
    updatedAt: toIsoString(row.updated_at)
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
    mediaAssetId:
      typeof row.media_asset_id === "string" ? row.media_asset_id : undefined,
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

  private getPool(): Pool {
    if (!this.pool) {
      throw new Error("Database has not been initialized");
    }
    return this.pool;
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
      await client.query("delete from storyboard_shot where script_id = $1", [
        scriptId
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

let adapter: DbAdapter | undefined;

function getAdapter(): DbAdapter {
  adapter ??= new PostgresDbAdapter(config.databaseUrl);
  return adapter;
}

export const db: DbAdapter = {
  initialize: () => getAdapter().initialize(),
  close: () => getAdapter().close(),
  createProduct: (input) => getAdapter().createProduct(input),
  getProduct: (productId) => getAdapter().getProduct(productId),
  updateProduct: (productId, patch) => getAdapter().updateProduct(productId, patch),
  createAsset: (input) => getAdapter().createAsset(input),
  getAsset: (assetId) => getAdapter().getAsset(assetId),
  findProductImageAssetByUrl: (url) => getAdapter().findProductImageAssetByUrl(url),
  createJob: (input) => getAdapter().createJob(input),
  getJob: (jobId) => getAdapter().getJob(jobId),
  updateJob: (jobId, patch) => getAdapter().updateJob(jobId, patch),
  createScript: (input) => getAdapter().createScript(input),
  getScript: (scriptId) => getAdapter().getScript(scriptId),
  updateScript: (scriptId, patch) => getAdapter().updateScript(scriptId, patch),
  freezeScript: (scriptId) => getAdapter().freezeScript(scriptId),
  listShots: (scriptId) => getAdapter().listShots(scriptId),
  createShots: (scriptId, shots) => getAdapter().createShots(scriptId, shots),
  replaceShots: (scriptId, shots) => getAdapter().replaceShots(scriptId, shots)
};
