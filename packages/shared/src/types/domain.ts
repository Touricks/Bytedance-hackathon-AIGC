export type AssetType =
  | "product_image"
  | "generated_clip"
  | "final_video"
  | "audio"
  | "subtitle";

export type AssetSource = "upload" | "seedance" | "tts" | "mock";

export type JobStatus = "queued" | "running" | "completed" | "failed";

export type JobStage =
  | "queued"
  | "script_generating"
  | "media_generating"
  | "completed"
  | "failed";

export interface Product {
  id: string;
  title: string;
  sellingPoints: string;
  audience: string;
  mainImageAssetId?: string;
  createdAt: string;
}

export interface Asset {
  id: string;
  type: AssetType;
  url: string;
  source: AssetSource;
  metadata?: Record<string, unknown>;
  createdAt: string;
}

export interface StoryboardShot {
  id: string;
  scriptId: string;
  index: number;
  durationSec: number;
  purpose?: "hook" | "benefit" | "cta";
  visualPrompt: string;
  cameraMotion: string;
  voiceover: string;
  subtitle: string;
  mediaAssetId?: string;
  status: "pending" | "ready" | "failed";
}

export interface Script {
  id: string;
  productId: string;
  jobId?: string;
  parentScriptId?: string;
  version: number;
  narrative: string;
  visualStyle: string;
  frozen: boolean;
  frozenAt?: string;
  rawJson: unknown;
  createdAt: string;
}

export interface GenerationJob {
  id: string;
  productId: string;
  status: JobStatus;
  stage: JobStage;
  progress: number;
  payload: Record<string, unknown>;
  trace: TraceEvent[];
  errorMessage?: string;
  finalAssetId?: string;
  scriptId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface TraceEvent {
  at: string;
  stage: JobStage;
  message: string;
  meta?: Record<string, unknown>;
}
