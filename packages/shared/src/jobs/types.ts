export const GENERATION_QUEUE_NAME = "generation";

export type GenerationJobName = "generate-video";

export interface GenerateVideoJobPayload {
  jobId: string;
  scriptId: string;
}

export const GENERATION_V2_QUEUE_NAME = "generation_v2";

export type GenerationV2JobName =
  | "generate_images"
  | "generate_image_candidate"
  | "generate_videos"
  | "generate_video_candidate"
  | "compose_final_video";

export interface GenerateImagesJobData {
  kind: "generate_images";
  jobId: string;
  batchId: string;
  shotId: string;
  workspaceId: string;
  imagePromptArtifactId: string;
  count: number;
  aspectRatio: "9:16" | "16:9" | "1:1";
  traceId: string;
}

export interface GenerateImageCandidateJobData {
  kind: "generate_image_candidate";
  jobId: string;
  batchId: string;
  candidateId: string;
  candidateIndex: number;
  shotId: string;
  workspaceId: string;
  imagePromptArtifactId: string;
  aspectRatio: "9:16" | "16:9" | "1:1";
  referenceImageUrls?: string[];
  traceId: string;
}

export interface GenerateVideosJobData {
  kind: "generate_videos";
  jobId: string;
  batchId: string;
  shotId: string;
  workspaceId: string;
  videoScriptArtifactId: string;
  count: number;
  aspectRatio: "9:16" | "16:9" | "1:1";
  traceId: string;
}

export interface GenerateVideoCandidateJobData {
  kind: "generate_video_candidate";
  jobId: string;
  batchId: string;
  candidateId: string;
  candidateIndex: number;
  shotId: string;
  workspaceId: string;
  videoScriptArtifactId: string;
  aspectRatio: "9:16" | "16:9" | "1:1";
  traceId: string;
}

export interface ComposeFinalVideoJobData {
  kind: "compose_final_video";
  jobId: string;
  finalVideoJobId: string;
  workspaceId: string;
  traceId: string;
}

export type GenerationV2JobData =
  | GenerateImagesJobData
  | GenerateImageCandidateJobData
  | GenerateVideosJobData
  | GenerateVideoCandidateJobData
  | ComposeFinalVideoJobData;
