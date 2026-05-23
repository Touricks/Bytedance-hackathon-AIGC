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

export interface CreativeBlueprintDetail {
  scriptId: string;
  product: Product;
  imageAsset: Asset | null;
  script: Script;
  creativeBlueprint: CreativeBlueprint;
  shots: StoryboardShot[];
}

export async function uploadProductImage(file: File): Promise<Asset> {
  const dataBase64 = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => {
      const result = String(reader.result);
      resolve(result.includes(",") ? result.split(",")[1] ?? "" : result);
    });
    reader.addEventListener("error", () => reject(reader.error));
    reader.readAsDataURL(file);
  });

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
    throw new Error(await response.text());
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
