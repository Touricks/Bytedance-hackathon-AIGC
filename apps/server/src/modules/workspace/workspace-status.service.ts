import type { CreativeWorkspace } from "@aigc-video/shared";
import { db } from "../../db/client.js";
import { oneClickFinalVideoService } from "../generation/one-click-final-video.service.js";
import { compareSourceFingerprint } from "./upstream-drift.service.js";
import {
  collectWorkspaceMaterialLibrary,
  collectWorkspaceMaterialLibraryForWorkspace,
} from "./workspace-material-library.service.js";
import {
  readManifest,
  toManifest,
  writeManifest,
} from "./workspace-manifest.service.js";
import {
  workspaceModuleRunService,
  type WorkspaceModuleRunModuleId,
  type WorkspaceModuleRuntimeView,
} from "./workspace-module-run.service.js";
import {
  promptViewModel as workspaceRuntimePromptViewModel,
  promptViewProvider as workspaceRuntimePromptViewProvider,
  runtimeMode as workspaceRuntimeMode,
} from "./workspace-runtime.js";
import type { WorkspaceDirectoryRequest } from "./workspace.schema.js";
import {
  resolveWorkspaceLocalPath,
  storageBindingView,
} from "./workspace-storage-binding.service.js";
import { workspaceRepository } from "./workspace.repository.js";

async function refreshWorkspaceForCurrentJob(workspace: CreativeWorkspace) {
  if (!workspace.currentJobId || workspace.status !== "video_generating") {
    return workspace;
  }

  const job = await db.getJob(workspace.currentJobId);
  if (job.status === "completed") {
    return db.updateWorkspace(workspace.id, { status: "video_ready" });
  }
  if (job.status === "failed") {
    return db.updateWorkspace(workspace.id, { status: "failed" });
  }

  return workspace;
}

export function runtimeMode() {
  return workspaceRuntimeMode();
}

export function promptViewProvider(): "ark" | "deterministic" {
  return workspaceRuntimePromptViewProvider();
}

export function promptViewModel() {
  return workspaceRuntimePromptViewModel();
}

function runtimeBuilderNextAction(input: {
  stage: string;
  endpoint: string;
  runtimeBuilder: string;
}) {
  const mode = runtimeMode();
  return {
    stage: input.stage,
    endpoint: input.endpoint,
    method: "POST",
    actionType: "runtime_builder",
    runtimeBuilder: input.runtimeBuilder,
    runtimeMode: mode,
    requiresHumanApproval: false,
    willCallProvider: mode === "real",
    provider: mode === "real" ? "ark" : undefined,
    requiresProviderConfig: mode === "real",
  };
}

function humanApprovalNextAction(input: { stage: string; endpoint: string }) {
  return {
    stage: input.stage,
    endpoint: input.endpoint,
    method: "POST",
    actionType: "human_approval",
    runtimeMode: runtimeMode(),
    requiresHumanApproval: true,
    willCallProvider: false,
    requiresProviderConfig: false,
  };
}

function nextActionFor(workspace: CreativeWorkspace) {
  switch (workspace.status) {
    case "draft":
      return runtimeBuilderNextAction({
        stage: "materials",
        endpoint: "/api/workspaces/{workspaceId}/material-intake/propose",
        runtimeBuilder: "material_intake",
      });
    case "materials_ready":
      return runtimeBuilderNextAction({
        stage: "brief",
        endpoint: "/api/workspaces/{workspaceId}/product-brief/propose",
        runtimeBuilder: "product_brief",
      });
    case "brief_proposed":
      return humanApprovalNextAction({
        stage: "brief",
        endpoint: "/api/workspaces/{workspaceId}/product-brief/approve",
      });
    case "brief_approved":
      return runtimeBuilderNextAction({
        stage: "storyboard",
        endpoint: "/api/workspaces/{workspaceId}/storyboard/propose",
        runtimeBuilder: "storyboard",
      });
    case "storyboard_proposed":
      return humanApprovalNextAction({
        stage: "storyboard",
        endpoint: "/api/workspaces/{workspaceId}/storyboard/approve",
      });
    case "storyboard_approved":
      return runtimeBuilderNextAction({
        stage: "shotprompt",
        endpoint: "/api/workspaces/{workspaceId}/shotprompt/propose",
        runtimeBuilder: "shotprompt",
      });
    case "shotprompt_proposed":
      return humanApprovalNextAction({
        stage: "shotprompt",
        endpoint: "/api/workspaces/{workspaceId}/shotprompt/approve",
      });
    case "shotprompt_approved":
      return {
        stage: "video",
        endpoint: "/api/workspaces/{workspaceId}/shot-sets",
        method: "POST",
        actionType: "shot_set_apply",
        runtimeMode: runtimeMode(),
        requiresHumanApproval: false,
        willCallProvider: runtimeMode() === "real",
        provider: runtimeMode() === "real" ? "seedance" : undefined,
        requiresProviderConfig: runtimeMode() === "real",
      };
    case "video_generating":
      return {
        stage: "video",
        endpoint: `/api/jobs/${workspace.currentJobId ?? ""}`,
        method: "GET",
        actionType: "status_poll",
        runtimeMode: runtimeMode(),
        requiresHumanApproval: false,
        willCallProvider: false,
        requiresProviderConfig: false,
      };
    case "video_ready":
      return {
        stage: "feedback",
        endpoint: "/api/workspaces/{workspaceId}/final-videos",
        method: "POST",
        actionType: "final_compose",
        runtimeMode: runtimeMode(),
        requiresHumanApproval: false,
        willCallProvider: false,
        requiresProviderConfig: false,
      };
    case "failed":
      return {
        stage: "recovery",
        endpoint: "/api/workspaces/{workspaceId}/status",
        method: "POST",
        actionType: "recovery",
        runtimeMode: runtimeMode(),
        requiresHumanApproval: true,
        willCallProvider: false,
        requiresProviderConfig: false,
      };
    case "missing":
      return {
        stage: "recovery",
        endpoint: "/api/workspaces/init",
        method: "POST",
        actionType: "recovery",
        runtimeMode: runtimeMode(),
        requiresHumanApproval: false,
        willCallProvider: false,
        requiresProviderConfig: false,
      };
  }
}

const workspaceModuleTables = [
  {
    moduleId: "prompt-requirements",
    table: "prompt_requirements_artifacts",
  },
  { moduleId: "material-intake", table: "material_intake_artifacts" },
  { moduleId: "product-brief", table: "product_brief_artifacts" },
  { moduleId: "storyboard", table: "storyboard_artifacts" },
  { moduleId: "shotprompt", table: "shot_prompt_artifacts" },
] as const;

type WorkspaceModuleId = (typeof workspaceModuleTables)[number]["moduleId"];

function toIsoString(value: unknown): string {
  return value instanceof Date ? value.toISOString() : String(value);
}

function moduleArtifactView(
  row: Record<string, unknown>,
  moduleId: WorkspaceModuleId,
) {
  return {
    id: String(row.id),
    workspaceId: String(row.workspace_id),
    moduleId,
    type: moduleId,
    status: String(row.status),
    isCurrent: Boolean(row.is_current),
    data: row.data,
    sourceFingerprint:
      row.source_fingerprint && typeof row.source_fingerprint === "object"
        ? row.source_fingerprint
        : {},
    promptAssembly:
      row.prompt_assembly && typeof row.prompt_assembly === "object"
        ? row.prompt_assembly
        : {},
    createdAt: toIsoString(row.created_at),
    updatedAt: toIsoString(row.updated_at),
    approvedAt: row.approved_at ? toIsoString(row.approved_at) : null,
  };
}

async function hydrateWorkspaceModuleState(
  workspaceId: string,
  module: (typeof workspaceModuleTables)[number],
  runtime: WorkspaceModuleRuntimeView,
) {
  const [proposedResult, currentResult] = await Promise.all([
    db.db2.pool().query(
      `select *
       from ${module.table}
       where workspace_id = $1 and status = 'proposed'
       order by created_at desc, id desc
       limit 1`,
      [workspaceId],
    ),
    db.db2.pool().query(
      `select *
       from ${module.table}
       where workspace_id = $1
         and status = 'approved'
         and is_current = true
       order by approved_at desc, created_at desc, id desc
       limit 1`,
      [workspaceId],
    ),
  ]);
  const proposed = proposedResult.rows[0]
    ? moduleArtifactView(proposedResult.rows[0], module.moduleId)
    : null;
  const current = currentResult.rows[0]
    ? moduleArtifactView(currentResult.rows[0], module.moduleId)
    : null;

  return {
    moduleId: module.moduleId,
    proposed,
    current,
    upstream: { upstreamChanged: false, changedSources: [] },
    runtime: moduleRuntimeFor(runtime, module.moduleId),
  };
}

function moduleRuntimeFor(
  runtime: WorkspaceModuleRuntimeView,
  moduleId: WorkspaceModuleId,
) {
  if (moduleId === "prompt-requirements") {
    return { active: null, latest: null, latestFailed: null };
  }
  const runModuleId = moduleId as WorkspaceModuleRunModuleId;
  const active =
    runtime.activeRuns.find((run) => run.moduleId === runModuleId) ?? null;
  const latest = runtime.latestRunsByModule[runModuleId] ?? null;
  return {
    active,
    latest,
    latestFailed: latest?.status === "FAILED" ? latest : null,
  };
}

function upstreamSourcesForModule(
  moduleId: WorkspaceModuleId,
  modules: Record<
    WorkspaceModuleId,
    Awaited<ReturnType<typeof hydrateWorkspaceModuleState>>
  >,
) {
  const sources = {
    promptRequirementsArtifactId: modules["prompt-requirements"].current?.id,
    materialIntakeArtifactId: modules["material-intake"].current?.id,
    productBriefArtifactId: modules["product-brief"].current?.id,
    storyboardArtifactId: modules.storyboard.current?.id,
  };
  switch (moduleId) {
    case "material-intake":
      return {
        promptRequirementsArtifactId: sources.promptRequirementsArtifactId,
      };
    case "product-brief":
      return {
        promptRequirementsArtifactId: sources.promptRequirementsArtifactId,
        materialIntakeArtifactId: sources.materialIntakeArtifactId,
      };
    case "storyboard":
      return {
        promptRequirementsArtifactId: sources.promptRequirementsArtifactId,
        materialIntakeArtifactId: sources.materialIntakeArtifactId,
        productBriefArtifactId: sources.productBriefArtifactId,
      };
    case "shotprompt":
      return sources;
    case "prompt-requirements":
      return {};
  }
}

async function hydrateWorkspaceModules(
  workspaceId: string,
  runtime: WorkspaceModuleRuntimeView,
) {
  const entries = await Promise.all(
    workspaceModuleTables.map(async (module) => [
      module.moduleId,
      await hydrateWorkspaceModuleState(workspaceId, module, runtime),
    ]),
  );
  const modules = Object.fromEntries(entries) as Record<
    WorkspaceModuleId,
    Awaited<ReturnType<typeof hydrateWorkspaceModuleState>>
  >;
  return Object.fromEntries(
    Object.entries(modules).map(([moduleId, state]) => {
      const typedModuleId = moduleId as WorkspaceModuleId;
      return [
        typedModuleId,
        {
          ...state,
          upstream: compareSourceFingerprint(
            state.current?.sourceFingerprint,
            upstreamSourcesForModule(typedModuleId, modules),
          ),
        },
      ];
    }),
  ) as typeof modules;
}

function hydrateWorkspaceArtifacts(
  modules: Awaited<ReturnType<typeof hydrateWorkspaceModules>>,
) {
  return {
    promptRequirements:
      modules["prompt-requirements"].current ??
      modules["prompt-requirements"].proposed,
    material:
      modules["material-intake"].current ?? modules["material-intake"].proposed,
    brief:
      modules["product-brief"].current ?? modules["product-brief"].proposed,
    storyboard: modules.storyboard.current ?? modules.storyboard.proposed,
    shotPrompt: modules.shotprompt.current ?? modules.shotprompt.proposed,
  };
}

function shotSetView(
  row: Record<string, unknown>,
  currentShotPromptArtifactId?: string | null,
) {
  const sourceFingerprint =
    row.source_fingerprint && typeof row.source_fingerprint === "object"
      ? row.source_fingerprint
      : {};
  return {
    id: String(row.id),
    workspaceId: String(row.workspace_id),
    shotPromptArtifactId: String(row.shot_prompt_artifact_id),
    status: String(row.status),
    sourceFingerprint,
    upstream: compareSourceFingerprint(sourceFingerprint, {
      shotPromptArtifactId: currentShotPromptArtifactId,
    }),
    createdAt: toIsoString(row.created_at),
    archivedAt: row.archived_at ? toIsoString(row.archived_at) : null,
  };
}

async function getActiveWorkspaceShotSet(workspaceId: string) {
  const [shotSetResult, currentShotPromptResult] = await Promise.all([
    db.db2.pool().query(
      `select *
       from shot_sets
       where workspace_id = $1 and status = 'active'
       order by created_at desc, id desc
       limit 1`,
      [workspaceId],
    ),
    db.db2.pool().query(
      `select id
       from shot_prompt_artifacts
       where workspace_id = $1 and status = 'approved' and is_current = true
       order by approved_at desc, created_at desc, id desc
       limit 1`,
      [workspaceId],
    ),
  ]);
  return shotSetResult.rows[0]
    ? shotSetView(
        shotSetResult.rows[0],
        typeof currentShotPromptResult.rows[0]?.id === "string"
          ? currentShotPromptResult.rows[0].id
          : null,
      )
    : null;
}

async function statusForWorkspaceId(workspaceId: string) {
  const workspace = await workspaceRepository.resolveFinalVideoWorkspaceStatus(
    await refreshWorkspaceForCurrentJob(await db.touchWorkspace(workspaceId)),
  );
  const binding = await db.getActiveWorkspaceStorage(workspace.id);
  if (!binding) {
    const [runtime, activeShotSet, activeOneClickFinalVideo] = await Promise.all([
      workspaceModuleRunService.listWorkspaceRuntime(workspace.id),
      getActiveWorkspaceShotSet(workspace.id),
      oneClickFinalVideoService.activeSummary(workspace.id),
    ]);
    const modules = await hydrateWorkspaceModules(workspace.id, runtime);
    return {
      workspace,
      manifest: toManifest({
        workspaceId: workspace.id,
        currentScriptId: workspace.currentScriptId,
        currentJobId: workspace.currentJobId,
      }),
      storage: storageBindingView(null),
      nextAction: "BIND_STORAGE",
      materialLibrary: {
        scannedAt: new Date().toISOString(),
        assets: [],
        rejected: [],
      },
      runtime,
      modules,
      activeShotSet,
      activeOneClickFinalVideo,
      artifacts: hydrateWorkspaceArtifacts(modules),
    };
  }
  if (binding.kind === "S3") {
    const [runtime, activeShotSet, activeOneClickFinalVideo, materialLibrary] =
      await Promise.all([
        workspaceModuleRunService.listWorkspaceRuntime(workspace.id),
        getActiveWorkspaceShotSet(workspace.id),
        oneClickFinalVideoService.activeSummary(workspace.id),
        collectWorkspaceMaterialLibraryForWorkspace(workspace.id),
      ]);
    const modules = await hydrateWorkspaceModules(workspace.id, runtime);
    return {
      workspace,
      manifest: toManifest({
        workspaceId: workspace.id,
        currentScriptId: workspace.currentScriptId,
        currentJobId: workspace.currentJobId,
      }),
      storage: storageBindingView(binding),
      nextAction: nextActionFor(workspace),
      materialLibrary,
      runtime,
      modules,
      activeShotSet,
      activeOneClickFinalVideo,
      artifacts: hydrateWorkspaceArtifacts(modules),
    };
  }
  return null;
}

export const workspaceStatusService = {
  async status(target: string | WorkspaceDirectoryRequest) {
    if (typeof target !== "string" && target.workspaceId && !target.directory) {
      const workspaceStatus = await statusForWorkspaceId(target.workspaceId);
      if (workspaceStatus) {
        return workspaceStatus;
      }
    }
    const localPath = await resolveWorkspaceLocalPath(target);
    const manifest = await readManifest(localPath);
    const touched = await db.touchWorkspace(manifest.workspaceId);
    const workspace = await workspaceRepository.resolveFinalVideoWorkspaceStatus(
      await refreshWorkspaceForCurrentJob(touched),
    );
    const binding = await db.getActiveWorkspaceStorage(workspace.id);
    const current = toManifest({
      workspaceId: workspace.id,
      currentScriptId: workspace.currentScriptId,
      currentJobId: workspace.currentJobId,
    });

    if (JSON.stringify(current) !== JSON.stringify(manifest)) {
      await writeManifest(localPath, current);
    }

    const [runtime, activeShotSet, activeOneClickFinalVideo] = await Promise.all([
      workspaceModuleRunService.listWorkspaceRuntime(workspace.id),
      getActiveWorkspaceShotSet(workspace.id),
      oneClickFinalVideoService.activeSummary(workspace.id),
    ]);
    const modules = await hydrateWorkspaceModules(workspace.id, runtime);

    return {
      workspace,
      manifest: current,
      storage: storageBindingView(binding),
      nextAction: nextActionFor(workspace),
      materialLibrary: await collectWorkspaceMaterialLibrary(localPath),
      runtime,
      modules,
      activeShotSet,
      activeOneClickFinalVideo,
      artifacts: hydrateWorkspaceArtifacts(modules),
    };
  },
};
