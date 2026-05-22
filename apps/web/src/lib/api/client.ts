import type {
  Asset,
  CreateGenerationJobRequest,
  GenerationJob,
  Script,
  StoryboardShot
} from "@aigc-video/shared";

const apiBaseUrl =
  import.meta.env.VITE_API_BASE_URL ??
  import.meta.env.PUBLIC_API_BASE_URL ??
  "http://localhost:3000";

export interface JobDetail {
  job: GenerationJob;
  script?: Script;
  shots?: StoryboardShot[];
  finalAsset?: Asset | null;
}

export async function createGenerationJob(input: CreateGenerationJobRequest) {
  const response = await fetch(`${apiBaseUrl}/api/creation/jobs`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(input)
  });

  if (!response.ok) {
    throw new Error(await response.text());
  }

  return (await response.json()) as { job: GenerationJob };
}

export async function getJobDetail(jobId: string): Promise<JobDetail> {
  const response = await fetch(`${apiBaseUrl}/api/jobs/${jobId}`);

  if (!response.ok) {
    throw new Error(await response.text());
  }

  return (await response.json()) as JobDetail;
}
