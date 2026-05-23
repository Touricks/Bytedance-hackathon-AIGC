import { nanoid } from "nanoid";
import type {
  Asset,
  GenerationJob,
  Product,
  Script,
  StoryboardShot
} from "@aigc-video/shared";
import { NotFoundError } from "../common/errors.js";

const products = new Map<string, Product>();
const assets = new Map<string, Asset>();
const jobs = new Map<string, GenerationJob>();
const scripts = new Map<string, Script>();
const shotsByScript = new Map<string, StoryboardShot[]>();

export const db = {
  createProduct(input: Omit<Product, "id" | "createdAt">): Product {
    const now = new Date().toISOString();
    const product = { ...input, id: nanoid(), createdAt: now };
    products.set(product.id, product);
    return product;
  },

  getProduct(productId: string): Product {
    const product = products.get(productId);
    if (!product) {
      throw new NotFoundError("Product");
    }
    return product;
  },

  createAsset(input: Omit<Asset, "id" | "createdAt">): Asset {
    const asset = {
      ...input,
      id: nanoid(),
      createdAt: new Date().toISOString()
    };
    assets.set(asset.id, asset);
    return asset;
  },

  createJob(input: Pick<GenerationJob, "productId" | "payload">): GenerationJob {
    const now = new Date().toISOString();
    const job: GenerationJob = {
      id: nanoid(),
      productId: input.productId,
      status: "queued",
      stage: "queued",
      progress: 0,
      payload: input.payload,
      trace: [],
      createdAt: now,
      updatedAt: now
    };
    jobs.set(job.id, job);
    return job;
  },

  getJob(jobId: string): GenerationJob {
    const job = jobs.get(jobId);
    if (!job) {
      throw new NotFoundError("GenerationJob");
    }
    return job;
  },

  updateJob(jobId: string, patch: Partial<GenerationJob>): GenerationJob {
    const job = this.getJob(jobId);
    const updated = {
      ...job,
      ...patch,
      updatedAt: new Date().toISOString()
    };
    jobs.set(jobId, updated);
    return updated;
  },

  createScript(input: Omit<Script, "id" | "createdAt">): Script {
    const script = {
      ...input,
      id: nanoid(),
      createdAt: new Date().toISOString()
    };
    scripts.set(script.id, script);
    return script;
  },

  getScript(scriptId: string): Script {
    const script = scripts.get(scriptId);
    if (!script) {
      throw new NotFoundError("Script");
    }
    return script;
  },

  listShots(scriptId: string): StoryboardShot[] {
    return shotsByScript.get(scriptId) ?? [];
  },

  createShots(scriptId: string, shots: Omit<StoryboardShot, "id" | "scriptId">[]) {
    const created = shots.map((shot) => ({
      ...shot,
      id: nanoid(),
      scriptId
    }));
    shotsByScript.set(scriptId, created);
    return created;
  },

  getAsset(assetId: string): Asset {
    const asset = assets.get(assetId);
    if (!asset) {
      throw new NotFoundError("Asset");
    }
    return asset;
  }
};
