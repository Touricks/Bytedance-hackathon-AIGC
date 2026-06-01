import type {
  Asset,
  CreativeWorkspace,
  GenerationJob,
  MaterialIntakeArtifact,
  ProductBriefArtifact,
  Script,
  ShotPromptArtifact,
  StoryboardArtifact,
  StoryboardShot,
} from "@aigc-video/shared";

const env = (
  import.meta as ImportMeta & {
    env?: Partial<
      Record<"VITE_API_BASE_URL" | "PUBLIC_API_BASE_URL" | "SERVER_PORT", string>
    >;
  }
).env;

function resolveApiBaseUrl(
  baseUrl: string,
  serverPort = "3000",
) {
  const parsed = new URL(baseUrl);
  if (!parsed.port && ["localhost", "127.0.0.1", "::1"].includes(parsed.hostname)) {
    parsed.port = serverPort;
  }
  return parsed.toString().replace(/\/$/, "");
}

const apiBaseUrl = resolveApiBaseUrl(
  env?.VITE_API_BASE_URL ?? env?.PUBLIC_API_BASE_URL ?? "http://localhost",
  env?.SERVER_PORT ?? "3000",
);

export interface JobDetail {
  job: GenerationJob;
  script?: Script;
  shots?: StoryboardShot[];
  finalAsset?: Asset | null;
  videoExport?: VideoExportRunView;
}

export interface WorkspaceNextAction {
  stage: string;
  endpoint: string;
  method: "GET" | "POST";
  actionType:
    | "runtime_builder"
    | "human_approval"
    | "video_generation"
    | "shot_set_apply"
    | "final_compose"
    | "status_poll"
    | "feedback"
    | "recovery";
  runtimeBuilder?: string;
  runtimeMode?: "mock" | "real";
  provider?: string;
  requiresHumanApproval: boolean;
  willCallProvider: boolean;
  requiresProviderConfig: boolean;
}

export interface WorkspaceManifest {
  schemaVersion: 1;
  workspaceId: string;
  currentScriptId: string;
  currentJobId?: string;
  traceFile: ".daireel/trace/events.jsonl";
}

export interface WorkspaceInitializeDetail {
  workspace: CreativeWorkspace;
  manifest: WorkspaceManifest;
}

export interface WorkspaceArtifact<TData> {
  id: string;
  workspaceId: string;
  scriptId?: string;
  moduleId:
    | "prompt-requirements"
    | "material-intake"
    | "product-brief"
    | "storyboard"
    | "shotprompt";
  type: string;
  status: "proposed" | "approved" | "archived" | "failed";
  isCurrent: boolean;
  data: TData;
  sourceFingerprint: Record<string, unknown>;
  promptAssembly: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  approvedAt: string | null;
}

export interface PromptRequirementsData {
  image?: Record<string, unknown>;
  script?: Record<string, unknown>;
  storyboard?: Record<string, unknown>;
  shotImage?: Record<string, unknown>;
  shotVideo?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface WorkspaceModuleState<TData = unknown> {
  moduleId: WorkspaceArtifact<TData>["moduleId"];
  proposed: WorkspaceArtifact<TData> | null;
  current: WorkspaceArtifact<TData> | null;
  upstream?: {
    upstreamChanged: boolean;
    changedSources: string[];
  };
}

export interface WorkspaceShotSet {
  id: string;
  workspaceId: string;
  shotPromptArtifactId: string;
  status: "active" | "archived" | string;
  sourceFingerprint: Record<string, unknown>;
  createdAt: string;
  archivedAt: string | null;
}

export interface RuntimePromptView {
  contractId: string;
  promptVersion: string;
  provider: "ark" | "seedance" | "deterministic";
  model?: string;
  nl: {
    title: string;
    sections: Array<{
      id: string;
      label: string;
      body: string;
    }>;
  };
  variables: Record<string, unknown>;
}

export interface ArtifactFormField {
  path: string;
  label: string;
  component:
    | "text"
    | "textarea"
    | "number"
    | "checkbox"
    | "select"
    | "string_list"
    | "nullable_text"
    | "asset_ref_select"
    | "asset_ref_list";
  source?: string;
  options?: string[];
  required?: boolean;
  readOnly?: boolean;
}

export interface ArtifactFormContract {
  artifactType: "brief" | "storyboard" | "shotprompt";
  artifactSchemaVersion: string;
  fields: ArtifactFormField[];
}

export interface VideoExportRunView {
  jobId: string;
  scriptId: string;
  workspaceId: string;
  provider: string;
  promptView: RuntimePromptView;
  finalVideo: {
    assetId: string;
    localUrl: string;
    providerUrl: string;
    archivedAt: string;
  };
}

export interface WorkspaceStatusDetail {
  workspace: CreativeWorkspace;
  manifest: WorkspaceManifest;
  nextAction: WorkspaceNextAction;
  materialLibrary: WorkspaceMaterialLibrary;
  modules?: {
    "prompt-requirements"?: WorkspaceModuleState;
    "material-intake"?: WorkspaceModuleState<MaterialIntakeArtifact>;
    "product-brief"?: WorkspaceModuleState<ProductBriefArtifact>;
    storyboard?: WorkspaceModuleState<StoryboardArtifact>;
    shotprompt?: WorkspaceModuleState<ShotPromptArtifact>;
  };
  activeShotSet?: WorkspaceShotSet | null;
  artifacts?: {
    promptRequirements?: WorkspaceArtifact<unknown> | null;
    material: WorkspaceArtifact<MaterialIntakeArtifact> | null;
    brief: WorkspaceArtifact<ProductBriefArtifact> | null;
    storyboard: WorkspaceArtifact<StoryboardArtifact> | null;
    shotPrompt: WorkspaceArtifact<ShotPromptArtifact> | null;
  };
}

export interface WorkspaceMaterialLibrary extends Omit<
  MaterialIntakeArtifact,
  "primaryProductRef"
> {
  primaryProductRef?: string;
}

export interface WorkspaceListDetail {
  workspaceRoot: string;
  workspaces: CreativeWorkspace[];
}

export interface WorkspaceMaterialUploadDetail {
  workspace: CreativeWorkspace;
  material: {
    ref: string;
    bytes: number;
    url: string;
  };
}

export interface WorkspaceDirectorySelectDetail {
  directory: string | null;
  cancelled: boolean;
  method: "macos" | "windows" | "linux" | "unsupported";
}

export interface WorkspaceArtifactDetail<TData> {
  workspace?: CreativeWorkspace;
  artifact: WorkspaceArtifact<TData>;
  promptView?: RuntimePromptView;
  form?: ArtifactFormContract;
  trace?: Record<string, unknown>;
}

export type WorkspaceMaterialDetail =
  WorkspaceArtifactDetail<MaterialIntakeArtifact>;
export type WorkspacePromptRequirementsDetail =
  WorkspaceArtifactDetail<PromptRequirementsData>;
export type WorkspaceBriefDetail =
  WorkspaceArtifactDetail<ProductBriefArtifact>;
export type WorkspaceStoryboardDetail =
  WorkspaceArtifactDetail<StoryboardArtifact>;
export type WorkspaceShotPromptDetail =
  WorkspaceArtifactDetail<ShotPromptArtifact>;

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
      if (looksLikeZodIssueJson(parsed.message)) {
        return "请检查表单字段后重试";
      }
      return parsed.message;
    }
  } catch {
    // Fall back to the raw response body below.
  }
  if (looksLikeZodIssueJson(body)) {
    return "请检查表单字段后重试";
  }
  return body || `Request failed with status ${response.status}`;
}

function looksLikeZodIssueJson(value: string) {
  try {
    const parsed = JSON.parse(value) as unknown;
    return (
      Array.isArray(parsed) &&
      parsed.some(
        (issue) =>
          issue &&
          typeof issue === "object" &&
          "code" in issue &&
          "path" in issue,
      )
    );
  } catch {
    return false;
  }
}

// ----- v2 envelope -----
export interface WorkflowEnvelope<T> {
  data: T;
  shotStatus?: string;
  nextAction?: string;
  warnings?: string[];
  traceId?: string;
}

export type ShotStatus =
  | "DRAFT"
  | "IMAGE_PROMPT_PROPOSING"
  | "IMAGE_PROMPT_READY"
  | "IMAGE_PROMPT_EDITED"
  | "IMAGE_GENERATING"
  | "IMAGE_CANDIDATES_READY"
  | "IMAGE_SELECTED"
  | "VIDEO_SCRIPT_PROPOSING"
  | "VIDEO_SCRIPT_READY"
  | "VIDEO_SCRIPT_EDITED"
  | "VIDEO_GENERATING"
  | "VIDEO_CANDIDATES_READY"
  | "VIDEO_SELECTED"
  | "FAILED";

export type NextAction =
  | "GENERATE_IMAGE_PROMPT"
  | "EDIT_IMAGE_PROMPT"
  | "GENERATE_IMAGES"
  | "POLL_IMAGE_BATCH"
  | "SELECT_IMAGE"
  | "GENERATE_VIDEO_SCRIPT"
  | "EDIT_VIDEO_SCRIPT"
  | "GENERATE_VIDEOS"
  | "POLL_VIDEO_BATCH"
  | "SELECT_VIDEO"
  | "READY_FOR_FINAL_COMPOSE"
  | "RETRY"
  | "NONE";

export type AspectRatio = "9:16" | "16:9" | "1:1";

export { apiBaseUrl };

export async function fetchJson<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  const text = await response.text();
  const body = text ? JSON.parse(text) : undefined;
  if (!response.ok) {
    throw new Error(
      `${init?.method ?? "GET"} ${path} failed: ${response.status} ${text}`,
    );
  }
  return body as T;
}

async function postJson<TResponse>(
  path: string,
  body: unknown,
): Promise<TResponse> {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error(await readApiErrorMessage(response));
  }

  return (await response.json()) as TResponse;
}

function normalizeWorkspaceArtifact<TData>(
  artifact: WorkspaceArtifact<TData> | null | undefined,
) {
  if (!artifact) return null;
  return {
    ...artifact,
    type: artifact.type ?? artifact.moduleId,
  };
}

async function postModuleArtifact<TData>(
  path: string,
  body: unknown,
): Promise<WorkspaceArtifactDetail<TData>> {
  const response = await postJson<{ data: WorkspaceArtifact<TData> }>(
    path,
    body,
  );
  return {
    artifact: normalizeWorkspaceArtifact(response.data)!,
  };
}

export async function uploadProductImage(file: File): Promise<Asset> {
  const dataBase64 = bytesToBase64(new Uint8Array(await file.arrayBuffer()));

  const response = await fetch(`${apiBaseUrl}/api/materials/product-image`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      filename: file.name,
      contentType: file.type || "image/png",
      dataBase64,
    }),
  });

  if (!response.ok) {
    throw new Error(await readApiErrorMessage(response));
  }

  return (await response.json()) as Asset;
}

export function toAbsoluteAssetUrl(url: string) {
  return url.startsWith("/") ? `${apiBaseUrl}${url}` : url;
}

export function toWorkspaceMaterialUrl(workspaceId: string, refOrUrl: string) {
  if (/^(https?:|data:|blob:)/.test(refOrUrl)) return refOrUrl;
  if (refOrUrl.startsWith("/")) return toAbsoluteAssetUrl(refOrUrl);
  const encodedRef = refOrUrl.split("/").map(encodeURIComponent).join("/");
  return `${apiBaseUrl}/api/workspaces/${encodeURIComponent(workspaceId)}/materials/${encodedRef}`;
}

export async function initializeWorkspace(
  directory: string,
): Promise<WorkspaceInitializeDetail> {
  return postJson<WorkspaceInitializeDetail>("/api/workspaces/init", {
    directory,
  });
}

export async function listWorkspaces(): Promise<WorkspaceListDetail> {
  const response = await fetch(`${apiBaseUrl}/api/workspaces`);

  if (!response.ok) {
    throw new Error(await readApiErrorMessage(response));
  }

  return (await response.json()) as WorkspaceListDetail;
}

export async function createWorkspace(
  name?: string,
): Promise<WorkspaceInitializeDetail> {
  return postJson<WorkspaceInitializeDetail>("/api/workspaces", { name });
}

export async function selectWorkspaceDirectory(): Promise<WorkspaceDirectorySelectDetail> {
  return postJson<WorkspaceDirectorySelectDetail>(
    "/api/workspaces/directory/select",
    {},
  );
}

export async function uploadWorkspaceMaterial(input: {
  workspaceId: string;
  file: File;
}): Promise<WorkspaceMaterialUploadDetail> {
  const body = new FormData();
  body.set("file", input.file);

  const response = await fetch(
    `${apiBaseUrl}/api/workspaces/${input.workspaceId}/materials`,
    {
      method: "POST",
      body,
    },
  );

  if (!response.ok) {
    throw new Error(await readApiErrorMessage(response));
  }

  return (await response.json()) as WorkspaceMaterialUploadDetail;
}

export async function getWorkspaceStatus(
  workspaceId: string,
): Promise<WorkspaceStatusDetail> {
  const detail = await fetchJson<WorkspaceStatusDetail>(
    `/api/workspaces/${workspaceId}/status`,
  );
  if (detail.artifacts) {
    detail.artifacts = {
      ...detail.artifacts,
      promptRequirements: normalizeWorkspaceArtifact(
        detail.artifacts.promptRequirements,
      ),
      material: normalizeWorkspaceArtifact(detail.artifacts.material),
      brief: normalizeWorkspaceArtifact(detail.artifacts.brief),
      storyboard: normalizeWorkspaceArtifact(detail.artifacts.storyboard),
      shotPrompt: normalizeWorkspaceArtifact(detail.artifacts.shotPrompt),
    };
  }
  return detail;
}

export async function proposeWorkspacePromptRequirements(input: {
  workspaceId: string;
  data: PromptRequirementsData;
}): Promise<WorkspacePromptRequirementsDetail> {
  return postModuleArtifact<PromptRequirementsData>(
    `/api/workspaces/${input.workspaceId}/prompt-requirements/propose`,
    { data: input.data },
  );
}

export async function approveWorkspacePromptRequirements(input: {
  workspaceId: string;
  artifactId?: string;
  data?: PromptRequirementsData;
}): Promise<WorkspacePromptRequirementsDetail> {
  return postModuleArtifact<PromptRequirementsData>(
    `/api/workspaces/${input.workspaceId}/prompt-requirements/approve`,
    input.artifactId ? { artifactId: input.artifactId } : { data: input.data },
  );
}

export async function runWorkspaceMaterialIntake(input: {
  workspaceId: string;
  prompt?: string;
  selectedMaterialRefs?: string[];
}): Promise<WorkspaceMaterialDetail> {
  return postModuleArtifact<MaterialIntakeArtifact>(
    `/api/workspaces/${input.workspaceId}/material-intake/propose`,
    {
      userDirection: input.prompt,
      selectedMaterialRefs: input.selectedMaterialRefs,
    },
  );
}

export async function approveWorkspaceMaterialIntake(
  workspaceId: string,
  data: MaterialIntakeArtifact,
): Promise<WorkspaceMaterialDetail> {
  return postModuleArtifact<MaterialIntakeArtifact>(
    `/api/workspaces/${workspaceId}/material-intake/approve`,
    { data },
  );
}

export async function proposeWorkspaceBrief(input: {
  workspaceId: string;
  userDirection?: string;
  title?: string;
  sellingPoints?: string;
  audience?: string;
  stylePreference?: string;
}): Promise<WorkspaceBriefDetail> {
  return postModuleArtifact<ProductBriefArtifact>(
    `/api/workspaces/${input.workspaceId}/product-brief/propose`,
    {
      userDirection: input.userDirection,
      title: input.title,
      sellingPoints: input.sellingPoints,
      audience: input.audience,
      stylePreference: input.stylePreference,
    },
  );
}

export async function approveWorkspaceBrief(
  workspaceId: string,
  data: ProductBriefArtifact,
): Promise<WorkspaceBriefDetail> {
  return postModuleArtifact<ProductBriefArtifact>(
    `/api/workspaces/${workspaceId}/product-brief/approve`,
    { data },
  );
}

export async function proposeWorkspaceStoryboard(
  workspaceId: string,
): Promise<WorkspaceStoryboardDetail> {
  return postModuleArtifact<StoryboardArtifact>(
    `/api/workspaces/${workspaceId}/storyboard/propose`,
    {},
  );
}

export async function approveWorkspaceStoryboard(
  workspaceId: string,
  data: StoryboardArtifact,
): Promise<WorkspaceStoryboardDetail> {
  return postModuleArtifact<StoryboardArtifact>(
    `/api/workspaces/${workspaceId}/storyboard/approve`,
    { data },
  );
}

export async function compileWorkspaceShotPrompt(input: {
  workspaceId: string;
  aspectRatio?: "9:16" | "16:9" | "1:1";
}): Promise<WorkspaceShotPromptDetail> {
  return postModuleArtifact<ShotPromptArtifact>(
    `/api/workspaces/${input.workspaceId}/shotprompt/propose`,
    { aspectRatio: input.aspectRatio },
  );
}

export async function approveWorkspaceShotPrompt(
  workspaceId: string,
  data: ShotPromptArtifact,
): Promise<WorkspaceShotPromptDetail> {
  return postModuleArtifact<ShotPromptArtifact>(
    `/api/workspaces/${workspaceId}/shotprompt/approve`,
    { data },
  );
}

export async function applyWorkspaceShotSet(input: {
  workspaceId: string;
  shotPromptArtifactId?: string;
}): Promise<{ data: WorkspaceShotSet }> {
  return postJson<{ data: WorkspaceShotSet }>(
    `/api/workspaces/${input.workspaceId}/shot-sets`,
    { shotPromptArtifactId: input.shotPromptArtifactId },
  );
}
