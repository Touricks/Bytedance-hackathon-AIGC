import type {
  Asset,
  CreateCreativeBlueprintRequest,
  CreativeBlueprint,
  CreateGenerationJobRequest,
  GenerationJob,
  Product,
  Script,
  StoryboardShot
} from "@aigc-video/shared";

const env = (
  import.meta as ImportMeta & {
    env?: Partial<Record<"VITE_API_BASE_URL" | "PUBLIC_API_BASE_URL", string>>;
  }
).env;

const apiBaseUrl =
  env?.VITE_API_BASE_URL ?? env?.PUBLIC_API_BASE_URL ?? "http://localhost:3000";

export interface JobDetail {
  job: GenerationJob;
  script?: Script;
  shots?: StoryboardShot[];
  finalAsset?: Asset | null;
}

export interface CreativeBlueprintDetail {
  scriptId: string;
  product: Product;
  imageAsset: Asset | null;
  script: Script;
  creativeBlueprint: CreativeBlueprint;
  shots: StoryboardShot[];
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }
  return btoa(binary);
}

async function readApiErrorMessage(response: Response): Promise<string> {
  const body = await response.text();
  try {
    const parsed = JSON.parse(body) as { message?: unknown };
    if (typeof parsed.message === "string" && parsed.message) {
      return parsed.message;
    }
  } catch {
    // Fall back to the raw response body below.
  }
  return body || `Request failed with status ${response.status}`;
}

export async function uploadProductImage(file: File): Promise<Asset> {
  const dataBase64 = bytesToBase64(new Uint8Array(await file.arrayBuffer()));

  const response = await fetch(`${apiBaseUrl}/api/materials/product-image`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      filename: file.name,
      contentType: file.type || "image/png",
      dataBase64
    })
  });

  if (!response.ok) {
    throw new Error(await readApiErrorMessage(response));
  }

  return (await response.json()) as Asset;
}

export function toAbsoluteAssetUrl(url: string) {
  return url.startsWith("/") ? `${apiBaseUrl}${url}` : url;
}

export async function createCreativeBlueprint(
  input: CreateCreativeBlueprintRequest
): Promise<CreativeBlueprintDetail> {
  const response = await fetch(`${apiBaseUrl}/api/creative-blueprints`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(input)
  });

  if (!response.ok) {
    throw new Error(await response.text());
  }

  return (await response.json()) as CreativeBlueprintDetail;
}

export async function getCreativeBlueprint(
  scriptId: string
): Promise<CreativeBlueprintDetail> {
  const response = await fetch(`${apiBaseUrl}/api/creative-blueprints/${scriptId}`);

  if (!response.ok) {
    throw new Error(await response.text());
  }

  return (await response.json()) as CreativeBlueprintDetail;
}

export async function createGenerationJob(
  input: CreateGenerationJobRequest
): Promise<JobDetail> {
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

  return (await response.json()) as JobDetail;
}

export async function getJobDetail(jobId: string): Promise<JobDetail> {
  const response = await fetch(`${apiBaseUrl}/api/jobs/${jobId}`);

  if (!response.ok) {
    throw new Error(await response.text());
  }

  return (await response.json()) as JobDetail;
}
