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
import { createFinalVideo } from "../../lib/api/finalVideo.js";
import { listImageRounds } from "../../lib/api/imageBatch.js";
import {
  proposeImagePrompt,
  regenerateImagePrompt,
} from "../../lib/api/imagePrompt.js";
import { selectImage } from "../../lib/api/imageSelect.js";
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
import { useFinalVideo } from "../workspace/hooks/useFinalVideo.js";
import { roundPollingInterval } from "./roundPolling.js";

const ACTIVE_STATUSES = new Set(["PENDING", "RUNNING"]);

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

  const finalVideo = useFinalVideo(activeFinalJobId);

  const invalidateWorkspace = async () => {
    await Promise.all([
      qc.invalidateQueries({ queryKey: ["workspace-status", workspaceId] }),
      qc.invalidateQueries({ queryKey: ["shots", workspaceId] }),
      qc.invalidateQueries({ queryKey: ["shot-sets", workspaceId] }),
      qc.invalidateQueries({ queryKey: ["workflow-status", workspaceId] }),
      qc.invalidateQueries({ queryKey: ["traces", workspaceId] }),
    ]);
  };

  const invalidateShot = async () => {
    await Promise.all([
      invalidateWorkspace(),
      qc.invalidateQueries({ queryKey: ["image-rounds", workspaceId] }),
      qc.invalidateQueries({ queryKey: ["video-rounds", workspaceId] }),
    ]);
  };

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
    mutationFn: () =>
      proposeImagePrompt(workspaceId, selectedShotId!, {
        userDirection: shotDirection.trim() || undefined,
      }),
    onSuccess: invalidateShot,
  });

  const regenerateImage = useMutation({
    mutationFn: (input: {
      baseArtifactId: string;
      feedbackImageCandidateId: string;
      userDirection: string;
    }) =>
      regenerateImagePrompt(workspaceId, selectedShotId!, input),
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
    mutationFn: () =>
      proposeVideoScript(workspaceId, selectedShotId!, {
        userDirection: shotDirection.trim() || undefined,
      }),
    onSuccess: invalidateShot,
  });

  const regenerateVideo = useMutation({
    mutationFn: (input: {
      baseArtifactId: string;
      feedbackVideoCandidateId: string;
      userDirection: string;
    }) =>
      regenerateVideoScript(workspaceId, selectedShotId!, input),
    onSuccess: invalidateShot,
  });

  const proposeAllVideos = useMutation({
    mutationFn: async () => {
      const targets = workflowShots.filter(
        (shot) =>
          shot.selectedImageId && !shot.selectedVideoId && !shot.activeVideoBatchId,
      );
      await Promise.all(
        targets.map((shot) =>
          proposeVideoScript(workspaceId, shot.shotId, {
            userDirection: shotDirection.trim() || undefined,
          }),
        ),
      );
      return targets.length;
    },
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

  const mutations = [
    uploadMaterial,
    startCreativeReview,
    materialIntake,
    approveMaterialIntake,
    approveMaterialIntakeAndProposeBrief,
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
    activeFinalJobId,
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
        retryImage.isPending,
      video:
        proposeVideo.isPending ||
        regenerateVideo.isPending ||
        proposeAllVideos.isPending ||
        selectVideoCandidate.isPending ||
        retryVideo.isPending,
      finalVideo: composeFinal.isPending || hasActiveFinalVideo,
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
      proposeImage: () => proposeImage.mutate(),
      regenerateImage: (input: {
        baseArtifactId: string;
        feedbackImageCandidateId: string;
        userDirection: string;
      }) =>
        regenerateImage.mutate(input),
      selectImageCandidate: (candidateId: string, batchId: string) =>
        selectImageCandidate.mutate({ candidateId, batchId }),
      proposeVideo: () => proposeVideo.mutate(),
      regenerateVideo: (input: {
        baseArtifactId: string;
        feedbackVideoCandidateId: string;
        userDirection: string;
      }) => regenerateVideo.mutate(input),
      proposeAllVideos: () => proposeAllVideos.mutate(),
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
      shotSets.isLoading,
    refreshing:
      workspaceStatus.isFetching ||
      workflow.isFetching ||
      shots.isFetching ||
      shotSets.isFetching,
    busy: mutations.some((mutation) => mutation.isPending),
    hasActiveGeneration: Boolean(hasActiveGeneration),
    error:
      errorText(workspaceStatus.error) ??
      errorText(workflow.error) ??
      errorText(shots.error) ??
      errorText(shotSets.error) ??
      mutationErrorText(mutations),
  };
}

export type WorkbenchViewModel = ReturnType<typeof useWorkbenchViewModel>;
