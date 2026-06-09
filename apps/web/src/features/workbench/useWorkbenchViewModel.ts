import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  MaterialIntakeArtifact,
  ProductBriefArtifact,
  ShotPromptArtifact,
  StoryboardArtifact,
} from "@aigc-video/shared";
import {
  applyWorkspaceShotSet,
  approveWorkspacePromptRequirements,
  approveWorkspaceMaterialIntake,
  approveWorkspaceBrief,
  approveWorkspaceShotPrompt,
  approveWorkspaceStoryboard,
  compileWorkspaceShotPrompt,
  getWorkspaceStatus,
  proposeWorkspacePromptRequirements,
  proposeWorkspaceBrief,
  proposeWorkspaceStoryboard,
  proposeWorkspaceStoryboardVoiceover,
  runWorkspaceMaterialIntake,
  uploadWorkspaceMaterial,
} from "../../lib/api/client.js";
import type {
  AspectRatio,
  PromptRequirementsData,
  ProposeWorkspaceBriefInput,
} from "../../lib/api/client.js";
import { createFinalVideo, listFinalVideos } from "../../lib/api/finalVideo.js";
import { getConfigLimits } from "../../lib/api/configLimits.js";
import { listImageRounds } from "../../lib/api/imageBatch.js";
import {
  proposeImagePrompt,
  regenerateImagePrompt,
} from "../../lib/api/imagePrompt.js";
import { selectImage } from "../../lib/api/imageSelect.js";
import {
  createOneClickFinalVideo,
  listOneClickFinalVideos,
} from "../../lib/api/oneClickFinalVideo.js";
import {
  createShotImageAutoSelection,
  listShotImageAutoSelections,
  type ShotImageAutoSelectionStatus,
} from "../../lib/api/shotImageAutoSelection.js";
import {
  getWorkflowStatus,
  listShots,
  listWorkspaceShotSets,
  retryShot,
} from "../../lib/api/shots.js";
import { listWorkspaceTraces } from "../../lib/api/trace.js";
import { listVideoRounds } from "../../lib/api/videoBatch.js";
import {
  proposeVideoScript,
  regenerateVideoScript,
} from "../../lib/api/videoScript.js";
import { selectVideo } from "../../lib/api/videoSelect.js";
import { useFinalVideo } from "./useFinalVideo.js";
import {
  oneClickPollingInterval,
  resolveOneClickFinalVideoState,
} from "./oneClickState.js";
import { roundPollingInterval } from "./roundPolling.js";
import { getVideoBatchGenerationTargets } from "./videoBatchTargets.js";
import {
  clampCandidateCount,
  readCandidateCountPreferences,
  writeCandidateCountPreference,
} from "./candidateCountPreferences.js";

const ACTIVE_STATUSES = new Set(["PENDING", "RUNNING"]);
const ACTIVE_AUTO_SELECTION_STATUSES = new Set<ShotImageAutoSelectionStatus>([
  "PENDING",
  "RUNNING",
  "WAITING",
]);

function errorText(error: unknown) {
  if (!error) return null;
  return error instanceof Error ? error.message : String(error);
}

function mutationErrorText(
  mutations: Array<{ error: unknown; isError: boolean }>,
) {
  return (
    mutations
      .map((mutation) => (mutation.isError ? errorText(mutation.error) : null))
      .find(Boolean) ?? null
  );
}

export function useWorkbenchViewModel(workspaceId: string) {
  const qc = useQueryClient();
  const [selectedShotId, setSelectedShotId] = useState<string | null>(null);
  const [materialPrompt, setMaterialPrompt] = useState("");
  const [briefDirection, setBriefDirection] = useState("");
  const [shotDirection, setShotDirection] = useState("");
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>("9:16");
  const [activeFinalJobId, setActiveFinalJobId] = useState<string | null>(null);
  const [imageCandidateCount, setImageCandidateCountState] = useState(1);
  const [videoCandidateCount, setVideoCandidateCountState] = useState(1);

  const configLimits = useQuery({
    queryKey: ["config-limits"],
    queryFn: getConfigLimits,
    staleTime: 60_000,
  });
  const limits = configLimits.data?.data;

  useEffect(() => {
    if (!limits) return;
    const storage = typeof window === "undefined" ? null : window.localStorage;
    const stored = readCandidateCountPreferences(storage, workspaceId);
    setImageCandidateCountState(
      clampCandidateCount({
        value: stored.image,
        fallback: limits.defaultImageCandidates,
        max: limits.maxImageCandidatesPerShot,
      }),
    );
    setVideoCandidateCountState(
      clampCandidateCount({
        value: stored.video,
        fallback: limits.defaultVideoCandidates,
        max: limits.maxVideoCandidatesPerShot,
      }),
    );
  }, [
    workspaceId,
    limits?.defaultImageCandidates,
    limits?.defaultVideoCandidates,
    limits?.maxImageCandidatesPerShot,
    limits?.maxVideoCandidatesPerShot,
  ]);

  const imageCandidateOptions = Array.from(
    { length: limits?.maxImageCandidatesPerShot ?? imageCandidateCount },
    (_, index) => index + 1,
  );
  const videoCandidateOptions = Array.from(
    { length: limits?.maxVideoCandidatesPerShot ?? videoCandidateCount },
    (_, index) => index + 1,
  );

  function setImageCandidateCount(value: number) {
    const next = clampCandidateCount({
      value,
      fallback: limits?.defaultImageCandidates ?? imageCandidateCount,
      max: limits?.maxImageCandidatesPerShot ?? Math.max(1, imageCandidateCount),
    });
    setImageCandidateCountState(next);
    writeCandidateCountPreference({
      storage: typeof window === "undefined" ? null : window.localStorage,
      workspaceId,
      kind: "image",
      value: next,
    });
  }

  function setVideoCandidateCount(value: number) {
    const next = clampCandidateCount({
      value,
      fallback: limits?.defaultVideoCandidates ?? videoCandidateCount,
      max: limits?.maxVideoCandidatesPerShot ?? Math.max(1, videoCandidateCount),
    });
    setVideoCandidateCountState(next);
    writeCandidateCountPreference({
      storage: typeof window === "undefined" ? null : window.localStorage,
      workspaceId,
      kind: "video",
      value: next,
    });
  }

  const workspaceStatus = useQuery({
    queryKey: ["workspace-status", workspaceId],
    queryFn: () => getWorkspaceStatus(workspaceId),
  });

  const shots = useQuery({
    queryKey: ["shots", workspaceId],
    queryFn: () => listShots(workspaceId),
    enabled: Boolean(workspaceStatus.data?.activeShotSet),
    refetchInterval: 30_000,
  });

  const shotSets = useQuery({
    queryKey: ["shot-sets", workspaceId],
    queryFn: () => listWorkspaceShotSets(workspaceId),
    refetchInterval: 30_000,
  });

  const workflow = useQuery({
    queryKey: ["workflow-status", workspaceId],
    queryFn: () => getWorkflowStatus(workspaceId),
    refetchInterval: (query) => {
      const rows = query.state.data?.data.shots ?? [];
      return rows.some((row) => row.status.endsWith("_GENERATING"))
        ? 3_000
        : 30_000;
    },
  });

  const workflowShots = workflow.data?.data.shots ?? [];
  useEffect(() => {
    if (workflowShots.length === 0) return;
    if (
      !selectedShotId ||
      !workflowShots.some((shot) => shot.shotId === selectedShotId)
    ) {
      setSelectedShotId(
        [...workflowShots].sort((a, b) => a.orderIndex - b.orderIndex)[0]!
          .shotId,
      );
    }
  }, [selectedShotId, workflowShots]);

  const selectedWorkflowShot =
    workflowShots.find((shot) => shot.shotId === selectedShotId) ?? null;
  const selectedShot =
    shots.data?.data.find((shot) => shot.id === selectedShotId) ?? null;

  const imageRounds = useQuery({
    queryKey: ["image-rounds", workspaceId, selectedShotId],
    queryFn: () => listImageRounds(workspaceId, selectedShotId!),
    enabled: Boolean(selectedShotId),
    refetchInterval: (query) =>
      roundPollingInterval({
        activeBatchId: selectedWorkflowShot?.activeImageBatchId,
        rounds: query.state.data?.data,
        intervalMs: 3_000,
      }),
  });

  const videoRounds = useQuery({
    queryKey: ["video-rounds", workspaceId, selectedShotId],
    queryFn: () => listVideoRounds(workspaceId, selectedShotId!),
    enabled: Boolean(selectedShotId),
    refetchInterval: (query) =>
      roundPollingInterval({
        activeBatchId: selectedWorkflowShot?.activeVideoBatchId,
        rounds: query.state.data?.data,
        intervalMs: 5_000,
      }),
  });

  const traces = useQuery({
    queryKey: ["traces", workspaceId, "compact"],
    queryFn: () => listWorkspaceTraces(workspaceId, { limit: 12 }),
    refetchInterval: 15_000,
  });

  const finalVideoJobs = useQuery({
    queryKey: ["final-videos", workspaceId],
    queryFn: () => listFinalVideos(workspaceId),
    refetchInterval: 15_000,
  });

  const oneClickFinalVideoJobs = useQuery({
    queryKey: ["one-click-final-videos", workspaceId],
    queryFn: () => listOneClickFinalVideos(workspaceId),
    refetchInterval: (query) =>
      oneClickPollingInterval({
        statusActiveJob: workspaceStatus.data?.activeOneClickFinalVideo,
        jobs: query.state.data?.data ?? [],
      }),
  });

  const shotImageAutoSelectionJobs = useQuery({
    queryKey: ["shot-image-auto-selections", workspaceId],
    queryFn: () => listShotImageAutoSelections(workspaceId),
    refetchInterval: (query) =>
      query.state.data?.data.some((job) => ACTIVE_AUTO_SELECTION_STATUSES.has(job.status))
        ? 3_000
        : 15_000,
  });

  const oneClickState = resolveOneClickFinalVideoState({
    statusActiveJob: workspaceStatus.data?.activeOneClickFinalVideo,
    jobs: oneClickFinalVideoJobs.data?.data ?? [],
    mutationPending: false,
  });
  const oneClickFinalVideo = oneClickState.displayJob;
  const shotImageAutoSelection =
    shotImageAutoSelectionJobs.data?.data.find((job) =>
      ACTIVE_AUTO_SELECTION_STATUSES.has(job.status),
    ) ??
    shotImageAutoSelectionJobs.data?.data[0] ??
    null;
  const hasActiveShotImageAutoSelection = Boolean(
    shotImageAutoSelection && ACTIVE_AUTO_SELECTION_STATUSES.has(shotImageAutoSelection.status),
  );

  const latestFinalJobId =
    finalVideoJobs.data?.data.find((job) => job.status === "PENDING" || job.status === "RUNNING")
      ?.id ??
    finalVideoJobs.data?.data.find((job) => job.status === "SUCCEEDED" && job.localUrl)
      ?.id ??
    finalVideoJobs.data?.data[0]?.id ??
    null;
  const displayedFinalJobId =
    oneClickFinalVideo?.finalVideoJobId ?? activeFinalJobId ?? latestFinalJobId;
  const finalVideo = useFinalVideo(displayedFinalJobId);

  const invalidateWorkspace = async () => {
    await Promise.all([
      qc.invalidateQueries({ queryKey: ["workspace-status", workspaceId] }),
      qc.invalidateQueries({ queryKey: ["shots", workspaceId] }),
      qc.invalidateQueries({ queryKey: ["shot-sets", workspaceId] }),
      qc.invalidateQueries({ queryKey: ["workflow-status", workspaceId] }),
      qc.invalidateQueries({ queryKey: ["traces", workspaceId] }),
      qc.invalidateQueries({ queryKey: ["final-videos", workspaceId] }),
      qc.invalidateQueries({ queryKey: ["one-click-final-videos", workspaceId] }),
      qc.invalidateQueries({ queryKey: ["shot-image-auto-selections", workspaceId] }),
    ]);
  };

  const invalidateShot = async () => {
    await Promise.all([
      invalidateWorkspace(),
      qc.invalidateQueries({ queryKey: ["image-rounds", workspaceId] }),
      qc.invalidateQueries({ queryKey: ["video-rounds", workspaceId] }),
    ]);
  };

  useEffect(() => {
    if (!hasActiveShotImageAutoSelection) return;
    const timer = globalThis.setInterval(() => {
      void invalidateShot();
    }, 3_000);
    return () => globalThis.clearInterval(timer);
  }, [hasActiveShotImageAutoSelection, workspaceId]);

  useEffect(() => {
    if (
      shotImageAutoSelection?.status === "SUCCEEDED" ||
      shotImageAutoSelection?.status === "FAILED"
    ) {
      void invalidateShot();
    }
  }, [shotImageAutoSelection?.id, shotImageAutoSelection?.status]);

  const uploadMaterial = useMutation({
    mutationFn: (file: File) => uploadWorkspaceMaterial({ workspaceId, file }),
    onSuccess: invalidateWorkspace,
  });

  const startCreativeReview = useMutation({
    mutationFn: async (data: PromptRequirementsData) => {
      const requirements = await proposeWorkspacePromptRequirements({
        workspaceId,
        data,
      });
      await approveWorkspacePromptRequirements({
        workspaceId,
        artifactId: requirements.artifact.id,
      });
      return await runWorkspaceMaterialIntake({
        workspaceId,
        prompt: materialPrompt.trim() || undefined,
      });
    },
    onSuccess: invalidateWorkspace,
  });

  const materialIntake = useMutation({
    mutationFn: () =>
      runWorkspaceMaterialIntake({
        workspaceId,
        prompt: materialPrompt.trim() || undefined,
      }),
    onSuccess: invalidateWorkspace,
  });

  const approveMaterialIntake = useMutation({
    mutationFn: (data: MaterialIntakeArtifact) =>
      approveWorkspaceMaterialIntake(workspaceId, data),
    onSuccess: invalidateWorkspace,
  });

  const approveMaterialIntakeAndProposeBrief = useMutation({
    mutationFn: async (data: MaterialIntakeArtifact) => {
      await approveWorkspaceMaterialIntake(workspaceId, data);
      return await proposeWorkspaceBrief({
        workspaceId,
        userDirection: briefDirection.trim() || undefined,
      });
    },
    onSettled: invalidateWorkspace,
  });

  const startOneClickFinalVideo = useMutation({
    mutationFn: (data: MaterialIntakeArtifact) =>
      createOneClickFinalVideo(
        workspaceId,
        {
          materialIntake: { data },
          outputAspectRatio: aspectRatio,
          autoSelectionStrategy: "first_success",
        },
        `${workspaceId}:one-click-final:${Date.now()}`,
      ),
    onSuccess: async (result) => {
      if (result.data.finalVideoJobId) {
        setActiveFinalJobId(result.data.finalVideoJobId);
      }
      await invalidateWorkspace();
    },
  });

  const proposeBrief = useMutation({
    mutationFn: (input?: Omit<ProposeWorkspaceBriefInput, "workspaceId">) =>
      proposeWorkspaceBrief({
        workspaceId,
        userDirection: (input?.userDirection ?? briefDirection.trim()) || undefined,
        draft: input?.draft,
        baseArtifactId: input?.baseArtifactId,
      }),
    onSettled: invalidateWorkspace,
  });

  const approveBrief = useMutation({
    mutationFn: (data: ProductBriefArtifact) =>
      approveWorkspaceBrief(workspaceId, data),
    onSuccess: invalidateWorkspace,
  });

  const approveBriefAndProposeStoryboard = useMutation({
    mutationFn: async (data: ProductBriefArtifact) => {
      await approveWorkspaceBrief(workspaceId, data);
      return await proposeWorkspaceStoryboard(workspaceId);
    },
    onSuccess: invalidateWorkspace,
  });

  const proposeStoryboard = useMutation({
    mutationFn: () => proposeWorkspaceStoryboard(workspaceId),
    onSuccess: invalidateWorkspace,
  });

  const proposeStoryboardVoiceover = useMutation({
    mutationFn: (input: {
      baseArtifactId?: string;
      draft: StoryboardArtifact;
      userDirection?: string;
    }) =>
      proposeWorkspaceStoryboardVoiceover({
        workspaceId,
        baseArtifactId: input.baseArtifactId,
        draft: input.draft,
        userDirection: input.userDirection,
      }),
    onSuccess: invalidateWorkspace,
  });

  const approveStoryboard = useMutation({
    mutationFn: (data: StoryboardArtifact) =>
      approveWorkspaceStoryboard(workspaceId, data),
    onSuccess: invalidateWorkspace,
  });

  const approveStoryboardAndProposeShotPrompt = useMutation({
    mutationFn: async (data: StoryboardArtifact) => {
      await approveWorkspaceStoryboard(workspaceId, data);
      return await compileWorkspaceShotPrompt({ workspaceId, aspectRatio });
    },
    onSuccess: invalidateWorkspace,
  });

  const compileShotPrompt = useMutation({
    mutationFn: () => compileWorkspaceShotPrompt({ workspaceId, aspectRatio }),
    onSuccess: invalidateWorkspace,
  });

  const approveShotPrompt = useMutation({
    mutationFn: (data: ShotPromptArtifact) =>
      approveWorkspaceShotPrompt(workspaceId, data),
    onSuccess: invalidateWorkspace,
  });

  const applyShotSet = useMutation({
    mutationFn: () => applyWorkspaceShotSet({ workspaceId }),
    onSuccess: invalidateShot,
  });

  const approveShotPromptAndApply = useMutation({
    mutationFn: async (data: ShotPromptArtifact) => {
      const approved = await approveWorkspaceShotPrompt(workspaceId, data);
      const applied = await applyWorkspaceShotSet({
        workspaceId,
        shotPromptArtifactId: approved.artifact.id,
      });
      await invalidateShot();
      return applied;
    },
  });

  const proposeImage = useMutation({
    mutationFn: (input?: { candidateCount?: number }) =>
      proposeImagePrompt(workspaceId, selectedShotId!, {
        userDirection: shotDirection.trim() || undefined,
        candidateCount: input?.candidateCount ?? imageCandidateCount,
      }),
    onSuccess: invalidateShot,
  });

  const regenerateImage = useMutation({
    mutationFn: (input: {
      baseArtifactId: string;
      feedbackImageCandidateId: string;
      userDirection: string;
      candidateCount?: number;
    }) =>
      regenerateImagePrompt(workspaceId, selectedShotId!, {
        ...input,
        candidateCount: input.candidateCount ?? imageCandidateCount,
      }),
    onSuccess: invalidateShot,
  });

  const selectImageCandidate = useMutation({
    mutationFn: (input: { candidateId: string; batchId: string }) =>
      selectImage(workspaceId, selectedShotId!, {
        imageCandidateId: input.candidateId,
        imageGenerationBatchId: input.batchId,
      }),
    onSuccess: invalidateShot,
  });

  const proposeVideo = useMutation({
    mutationFn: (input?: { candidateCount?: number }) =>
      proposeVideoScript(workspaceId, selectedShotId!, {
        userDirection: shotDirection.trim() || undefined,
        candidateCount: input?.candidateCount ?? videoCandidateCount,
      }),
    onSuccess: invalidateShot,
  });

  const regenerateVideo = useMutation({
    mutationFn: (input: {
      baseArtifactId: string;
      feedbackVideoCandidateId: string;
      userDirection: string;
      candidateCount?: number;
    }) =>
      regenerateVideoScript(workspaceId, selectedShotId!, {
        ...input,
        candidateCount: input.candidateCount ?? videoCandidateCount,
      }),
    onSuccess: invalidateShot,
  });

  const proposeAllVideos = useMutation({
    mutationFn: async (input?: { candidateCount?: number }) => {
      const allImagesSelected =
        workflowShots.length > 0 && workflowShots.every((shot) => Boolean(shot.selectedImageId));
      const targets = allImagesSelected ? getVideoBatchGenerationTargets(workflowShots) : [];
      const candidateCount = input?.candidateCount ?? videoCandidateCount;
      await Promise.all(
        targets.map((shot) =>
          proposeVideoScript(workspaceId, shot.shotId, {
            userDirection: shotDirection.trim() || undefined,
            candidateCount,
          }),
        ),
      );
      return targets.length;
    },
    onSuccess: invalidateShot,
  });

  const startShotImageAutoSelection = useMutation({
    mutationFn: (input?: { candidateCount?: number }) =>
      createShotImageAutoSelection(
        workspaceId,
        { candidateCount: input?.candidateCount ?? imageCandidateCount },
        `${workspaceId}:shot-image-auto-selection:${Date.now()}`,
      ),
    onSuccess: invalidateShot,
  });

  const selectVideoCandidate = useMutation({
    mutationFn: (input: { candidateId: string; batchId: string }) =>
      selectVideo(workspaceId, selectedShotId!, {
        videoCandidateId: input.candidateId,
        videoGenerationBatchId: input.batchId,
      }),
    onSuccess: invalidateShot,
  });

  const retryImage = useMutation({
    mutationFn: () =>
      retryShot(
        selectedShotId!,
        "image_batch",
        `${workspaceId}:${selectedShotId}:image:${Date.now()}`,
      ),
    onSuccess: invalidateShot,
  });

  const retryVideo = useMutation({
    mutationFn: () =>
      retryShot(
        selectedShotId!,
        "video_batch",
        `${workspaceId}:${selectedShotId}:video:${Date.now()}`,
      ),
    onSuccess: invalidateShot,
  });

  const composeFinal = useMutation({
    mutationFn: () =>
      createFinalVideo(
        workspaceId,
        { outputAspectRatio: aspectRatio },
        `${workspaceId}:final:${Date.now()}`,
      ),
    onSuccess: async (result) => {
      setActiveFinalJobId(result.data.finalVideoJobId);
      await invalidateWorkspace();
    },
  });

  const artifacts = workspaceStatus.data?.artifacts;
  const latestImageRound = (imageRounds.data?.data ?? [])[0] ?? null;
  const latestVideoRound = (videoRounds.data?.data ?? [])[0] ?? null;
  const latestImageBatch = latestImageRound?.batch ?? null;
  const latestVideoBatch = latestVideoRound?.batch ?? null;
  const hasActiveGeneration =
    (latestImageBatch && ACTIVE_STATUSES.has(latestImageBatch.status)) ||
    (latestVideoBatch && ACTIVE_STATUSES.has(latestVideoBatch.status));
  const finalVideoStatus = finalVideo.data?.data?.status ?? null;
  const hasActiveFinalVideo =
    finalVideoStatus === "PENDING" || finalVideoStatus === "RUNNING";
  const hasActiveOneClickFinalVideo =
    startOneClickFinalVideo.isPending || oneClickState.hasActiveJob;

  const mutations = [
    uploadMaterial,
    startCreativeReview,
    materialIntake,
    approveMaterialIntake,
    approveMaterialIntakeAndProposeBrief,
    startOneClickFinalVideo,
    proposeBrief,
    approveBrief,
    approveBriefAndProposeStoryboard,
    proposeStoryboard,
    proposeStoryboardVoiceover,
    approveStoryboard,
    approveStoryboardAndProposeShotPrompt,
    compileShotPrompt,
    approveShotPrompt,
    applyShotSet,
    approveShotPromptAndApply,
    proposeImage,
    regenerateImage,
    selectImageCandidate,
    proposeVideo,
    regenerateVideo,
    proposeAllVideos,
    startShotImageAutoSelection,
    selectVideoCandidate,
    retryImage,
    retryVideo,
    composeFinal,
  ];

  return {
    workspaceId,
    workspace: workspaceStatus.data?.workspace ?? null,
    workspaceStatus: workspaceStatus.data ?? null,
    materialLibrary: workspaceStatus.data?.materialLibrary ?? null,
    artifacts: {
      promptRequirements: artifacts?.promptRequirements ?? null,
      material: artifacts?.material ?? null,
      brief: artifacts?.brief ?? null,
      storyboard: artifacts?.storyboard ?? null,
      shotPrompt: artifacts?.shotPrompt ?? null,
    },
    workflow: workflow.data?.data ?? null,
    shots: [...workflowShots].sort((a, b) => a.orderIndex - b.orderIndex),
    shotRows: shots.data?.data ?? [],
    shotSets: shotSets.data?.data ?? [],
    selectedShotId,
    selectedShot,
    selectedWorkflowShot,
    imageRounds: imageRounds.data?.data ?? [],
    videoRounds: videoRounds.data?.data ?? [],
    latestImageRound,
    latestVideoRound,
    traces: traces.data?.data ?? [],
    finalVideo: finalVideo.data?.data ?? null,
    oneClickFinalVideo,
    shotImageAutoSelection,
    activeFinalJobId: displayedFinalJobId,
    candidateCounts: {
      image: imageCandidateCount,
      video: videoCandidateCount,
      imageOptions: imageCandidateOptions,
      videoOptions: videoCandidateOptions,
      loading: configLimits.isLoading,
      maxImage: limits?.maxImageCandidatesPerShot ?? imageCandidateCount,
      maxVideo: limits?.maxVideoCandidatesPerShot ?? videoCandidateCount,
    },
    inputs: {
      materialPrompt,
      setMaterialPrompt,
      briefDirection,
      setBriefDirection,
      shotDirection,
      setShotDirection,
      aspectRatio,
      setAspectRatio,
    },
    pending: {
      materialIntake: startCreativeReview.isPending || materialIntake.isPending,
      productBrief:
        approveMaterialIntakeAndProposeBrief.isPending || proposeBrief.isPending,
      oneClickFinalVideo: hasActiveOneClickFinalVideo,
      storyboard: approveBriefAndProposeStoryboard.isPending || proposeStoryboard.isPending,
      storyboardVoiceover: proposeStoryboardVoiceover.isPending,
      shotPrompt:
        approveStoryboardAndProposeShotPrompt.isPending ||
        compileShotPrompt.isPending ||
        approveShotPrompt.isPending,
      applyShotSet: applyShotSet.isPending || approveShotPromptAndApply.isPending,
      image:
        proposeImage.isPending ||
        regenerateImage.isPending ||
        selectImageCandidate.isPending ||
        startShotImageAutoSelection.isPending ||
        hasActiveShotImageAutoSelection ||
        retryImage.isPending,
      video:
        proposeVideo.isPending ||
        regenerateVideo.isPending ||
        proposeAllVideos.isPending ||
        selectVideoCandidate.isPending ||
        retryVideo.isPending,
      finalVideo: composeFinal.isPending || hasActiveFinalVideo,
      shotImageAutoSelection:
        startShotImageAutoSelection.isPending || hasActiveShotImageAutoSelection,
    },
    actions: {
      setSelectedShotId,
      refresh: invalidateWorkspace,
      uploadMaterial: (file: File) => uploadMaterial.mutate(file),
      startCreativeReview: (data: PromptRequirementsData) =>
        startCreativeReview.mutate(data),
      runMaterialIntake: () => materialIntake.mutate(),
      approveMaterialIntake: () => {
        const data = artifacts?.material?.data;
        if (data) approveMaterialIntake.mutate(data);
      },
      approveMaterialIntakeAndProposeBrief: (data: MaterialIntakeArtifact) =>
        approveMaterialIntakeAndProposeBrief.mutate(data),
      startOneClickFinalVideo: (data: MaterialIntakeArtifact) =>
        startOneClickFinalVideo.mutate(data),
      proposeBrief: (input?: Omit<ProposeWorkspaceBriefInput, "workspaceId">) =>
        proposeBrief.mutateAsync(input),
      approveBrief: () => {
        const data = artifacts?.brief?.data;
        if (data) approveBrief.mutate(data);
      },
      approveBriefAndProposeStoryboard: (data: ProductBriefArtifact) =>
        approveBriefAndProposeStoryboard.mutate(data),
      proposeStoryboard: () => proposeStoryboard.mutate(),
      proposeStoryboardVoiceover: (input: {
        baseArtifactId?: string;
        draft: StoryboardArtifact;
        userDirection?: string;
      }) => proposeStoryboardVoiceover.mutate(input),
      approveStoryboard: () => {
        const data = artifacts?.storyboard?.data;
        if (data) approveStoryboard.mutate(data);
      },
      approveStoryboardAndProposeShotPrompt: (data: StoryboardArtifact) =>
        approveStoryboardAndProposeShotPrompt.mutate(data),
      compileShotPrompt: () => compileShotPrompt.mutate(),
      approveShotPrompt: () => {
        const data = artifacts?.shotPrompt?.data;
        if (data) approveShotPrompt.mutate(data);
      },
      approveShotPromptData: (data: ShotPromptArtifact) =>
        approveShotPrompt.mutate(data),
      applyShotSet: () => applyShotSet.mutate(),
      approveShotPromptAndApply: (data: ShotPromptArtifact) =>
        approveShotPromptAndApply.mutate(data),
      setImageCandidateCount,
      setVideoCandidateCount,
      proposeImage: () => proposeImage.mutate({ candidateCount: imageCandidateCount }),
      regenerateImage: (input: {
        baseArtifactId: string;
        feedbackImageCandidateId: string;
        userDirection: string;
        candidateCount?: number;
      }) =>
        regenerateImage.mutate({
          ...input,
          candidateCount: input.candidateCount ?? imageCandidateCount,
        }),
      selectImageCandidate: (candidateId: string, batchId: string) =>
        selectImageCandidate.mutate({ candidateId, batchId }),
      startShotImageAutoSelection: () =>
        startShotImageAutoSelection.mutate({ candidateCount: imageCandidateCount }),
      proposeVideo: () => proposeVideo.mutate({ candidateCount: videoCandidateCount }),
      regenerateVideo: (input: {
        baseArtifactId: string;
        feedbackVideoCandidateId: string;
        userDirection: string;
        candidateCount?: number;
      }) =>
        regenerateVideo.mutate({
          ...input,
          candidateCount: input.candidateCount ?? videoCandidateCount,
        }),
      proposeAllVideos: () => proposeAllVideos.mutate({ candidateCount: videoCandidateCount }),
      selectVideoCandidate: (candidateId: string, batchId: string) =>
        selectVideoCandidate.mutate({ candidateId, batchId }),
      retryImage: () => retryImage.mutate(),
      retryVideo: () => retryVideo.mutate(),
      composeFinal: () => composeFinal.mutate(),
    },
    loading:
      workspaceStatus.isLoading ||
      workflow.isLoading ||
      shots.isLoading ||
      shotSets.isLoading ||
      oneClickFinalVideoJobs.isLoading ||
      shotImageAutoSelectionJobs.isLoading ||
      configLimits.isLoading,
    refreshing:
      workspaceStatus.isFetching ||
      workflow.isFetching ||
      shots.isFetching ||
      shotSets.isFetching ||
      oneClickFinalVideoJobs.isFetching ||
      shotImageAutoSelectionJobs.isFetching ||
      configLimits.isFetching,
    busy:
      mutations.some((mutation) => mutation.isPending) ||
      hasActiveOneClickFinalVideo ||
      hasActiveShotImageAutoSelection,
    hasActiveGeneration:
      Boolean(hasActiveGeneration) ||
      hasActiveOneClickFinalVideo ||
      hasActiveShotImageAutoSelection,
    error:
      errorText(workspaceStatus.error) ??
      errorText(workflow.error) ??
      errorText(shots.error) ??
      errorText(shotSets.error) ??
      errorText(oneClickFinalVideoJobs.error) ??
      errorText(shotImageAutoSelectionJobs.error) ??
      errorText(configLimits.error) ??
      mutationErrorText(mutations),
  };
}

export type WorkbenchViewModel = ReturnType<typeof useWorkbenchViewModel>;
