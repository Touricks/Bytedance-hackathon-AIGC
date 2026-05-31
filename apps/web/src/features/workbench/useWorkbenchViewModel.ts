import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  ProductBriefArtifact,
  ShotPromptArtifact,
  StoryboardArtifact,
} from "@aigc-video/shared";
import {
  approveWorkspaceBrief,
  approveWorkspaceShotPrompt,
  approveWorkspaceStoryboard,
  compileWorkspaceShotPrompt,
  getWorkspaceStatus,
  proposeWorkspaceBrief,
  proposeWorkspaceStoryboard,
  runWorkspaceMaterialIntake,
  uploadWorkspaceMaterial,
} from "../../lib/api/client.js";
import type { AspectRatio } from "../../lib/api/client.js";
import { createFinalVideo } from "../../lib/api/finalVideo.js";
import { listImageRounds } from "../../lib/api/imageBatch.js";
import { proposeImagePrompt } from "../../lib/api/imagePrompt.js";
import { selectImage } from "../../lib/api/imageSelect.js";
import { getWorkflowStatus, listShots, retryShot } from "../../lib/api/shots.js";
import { listWorkspaceTraces } from "../../lib/api/trace.js";
import { listVideoRounds } from "../../lib/api/videoBatch.js";
import { proposeVideoScript } from "../../lib/api/videoScript.js";
import { selectVideo } from "../../lib/api/videoSelect.js";
import { useFinalVideo } from "../workspace/hooks/useFinalVideo.js";

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
    refetchInterval: () =>
      selectedWorkflowShot?.status === "IMAGE_GENERATING" ? 3_000 : false,
  });

  const videoRounds = useQuery({
    queryKey: ["video-rounds", workspaceId, selectedShotId],
    queryFn: () => listVideoRounds(workspaceId, selectedShotId!),
    enabled: Boolean(selectedShotId),
    refetchInterval: () =>
      selectedWorkflowShot?.status === "VIDEO_GENERATING" ? 5_000 : false,
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

  const materialIntake = useMutation({
    mutationFn: () =>
      runWorkspaceMaterialIntake({
        workspaceId,
        prompt: materialPrompt.trim() || undefined,
      }),
    onSuccess: invalidateWorkspace,
  });

  const proposeBrief = useMutation({
    mutationFn: () =>
      proposeWorkspaceBrief({
        workspaceId,
        userDirection: briefDirection.trim() || undefined,
      }),
    onSuccess: invalidateWorkspace,
  });

  const approveBrief = useMutation({
    mutationFn: (data: ProductBriefArtifact) =>
      approveWorkspaceBrief(workspaceId, data),
    onSuccess: invalidateWorkspace,
  });

  const proposeStoryboard = useMutation({
    mutationFn: () => proposeWorkspaceStoryboard(workspaceId),
    onSuccess: invalidateWorkspace,
  });

  const approveStoryboard = useMutation({
    mutationFn: (data: StoryboardArtifact) =>
      approveWorkspaceStoryboard(workspaceId, data),
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

  const proposeImage = useMutation({
    mutationFn: () =>
      proposeImagePrompt(workspaceId, selectedShotId!, {
        userDirection: shotDirection.trim() || undefined,
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
    mutationFn: () =>
      proposeVideoScript(workspaceId, selectedShotId!, {
        userDirection: shotDirection.trim() || undefined,
      }),
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
  const latestImageRound = imageRounds.data?.data[0] ?? null;
  const latestVideoRound = videoRounds.data?.data[0] ?? null;
  const latestImageBatch = latestImageRound?.batch ?? null;
  const latestVideoBatch = latestVideoRound?.batch ?? null;
  const hasActiveGeneration =
    (latestImageBatch && ACTIVE_STATUSES.has(latestImageBatch.status)) ||
    (latestVideoBatch && ACTIVE_STATUSES.has(latestVideoBatch.status));

  const mutations = [
    uploadMaterial,
    materialIntake,
    proposeBrief,
    approveBrief,
    proposeStoryboard,
    approveStoryboard,
    compileShotPrompt,
    approveShotPrompt,
    proposeImage,
    selectImageCandidate,
    proposeVideo,
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
      material: artifacts?.material ?? null,
      brief: artifacts?.brief ?? null,
      storyboard: artifacts?.storyboard ?? null,
      shotPrompt: artifacts?.shotPrompt ?? null,
    },
    workflow: workflow.data?.data ?? null,
    shots: [...workflowShots].sort((a, b) => a.orderIndex - b.orderIndex),
    shotRows: shots.data?.data ?? [],
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
    actions: {
      setSelectedShotId,
      refresh: invalidateWorkspace,
      uploadMaterial: (file: File) => uploadMaterial.mutate(file),
      runMaterialIntake: () => materialIntake.mutate(),
      proposeBrief: () => proposeBrief.mutate(),
      approveBrief: () => {
        const data = artifacts?.brief?.data;
        if (data) approveBrief.mutate(data);
      },
      proposeStoryboard: () => proposeStoryboard.mutate(),
      approveStoryboard: () => {
        const data = artifacts?.storyboard?.data;
        if (data) approveStoryboard.mutate(data);
      },
      compileShotPrompt: () => compileShotPrompt.mutate(),
      approveShotPrompt: () => {
        const data = artifacts?.shotPrompt?.data;
        if (data) approveShotPrompt.mutate(data);
      },
      proposeImage: () => proposeImage.mutate(),
      selectImageCandidate: (candidateId: string, batchId: string) =>
        selectImageCandidate.mutate({ candidateId, batchId }),
      proposeVideo: () => proposeVideo.mutate(),
      selectVideoCandidate: (candidateId: string, batchId: string) =>
        selectVideoCandidate.mutate({ candidateId, batchId }),
      retryImage: () => retryImage.mutate(),
      retryVideo: () => retryVideo.mutate(),
      composeFinal: () => composeFinal.mutate(),
    },
    loading:
      workspaceStatus.isLoading || workflow.isLoading || shots.isLoading,
    refreshing:
      workspaceStatus.isFetching || workflow.isFetching || shots.isFetching,
    busy: mutations.some((mutation) => mutation.isPending),
    hasActiveGeneration: Boolean(hasActiveGeneration),
    error:
      errorText(workspaceStatus.error) ??
      errorText(workflow.error) ??
      errorText(shots.error) ??
      mutationErrorText(mutations),
  };
}

export type WorkbenchViewModel = ReturnType<typeof useWorkbenchViewModel>;
