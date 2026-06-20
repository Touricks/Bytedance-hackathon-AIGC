import {
  approveWorkspacePromptRequirements,
  proposeWorkspacePromptRequirements,
  runWorkspaceMaterialIntake,
} from "../../lib/api/client.js";
import type { PromptRequirementsData } from "../../lib/api/client.js";

type PromptRequirementsProposer = (input: {
  workspaceId: string;
  data: PromptRequirementsData;
}) => Promise<{ artifact: { id: string } }>;

type PromptRequirementsApprover = (input: {
  workspaceId: string;
  artifactId?: string;
  data?: PromptRequirementsData;
}) => Promise<unknown>;

type MaterialIntakeRunner = (input: {
  workspaceId: string;
  prompt?: string;
}) => Promise<unknown>;

interface StartCreativeReviewSequenceDeps {
  proposePromptRequirements: PromptRequirementsProposer;
  approvePromptRequirements: PromptRequirementsApprover;
  runMaterialIntake: MaterialIntakeRunner;
}

export interface StartCreativeReviewSequenceInput {
  workspaceId: string;
  data: PromptRequirementsData;
  materialPrompt: string;
  refreshWorkspace: () => Promise<unknown> | unknown;
  deps?: Partial<StartCreativeReviewSequenceDeps>;
}

export async function runStartCreativeReviewSequence({
  workspaceId,
  data,
  materialPrompt,
  refreshWorkspace,
  deps,
}: StartCreativeReviewSequenceInput) {
  const proposePromptRequirements =
    deps?.proposePromptRequirements ?? proposeWorkspacePromptRequirements;
  const approvePromptRequirements =
    deps?.approvePromptRequirements ?? approveWorkspacePromptRequirements;
  const runMaterialIntake = deps?.runMaterialIntake ?? runWorkspaceMaterialIntake;

  const requirements = await proposePromptRequirements({
    workspaceId,
    data,
  });
  await approvePromptRequirements({
    workspaceId,
    artifactId: requirements.artifact.id,
  });
  await refreshWorkspace();

  return await runMaterialIntake({
    workspaceId,
    prompt: materialPrompt.trim() || undefined,
  });
}
