import type { CreativeWorkspace } from "@aigc-video/shared";
import { getWorkspaceStorageAdapter } from "./storage/workspace-storage-resolver.js";

const workspaceReviewRelativePath = "review";

export async function writeReviewSnapshot(input: {
  workspace: CreativeWorkspace;
  artifact: "product-brief" | "storyboard";
  status: "proposed" | "approved";
  schemaVersion: string;
  data: unknown;
}) {
  const adapter = await getWorkspaceStorageAdapter(input.workspace.id);
  await adapter.putObject({
    relativePath: `${workspaceReviewRelativePath}/${input.artifact}.${input.status}.json`,
    body: `${JSON.stringify(
      {
        artifact: input.artifact,
        status: input.status,
        schemaVersion: input.schemaVersion,
        workspaceId: input.workspace.id,
        scriptId: input.workspace.currentScriptId,
        writtenAt: new Date().toISOString(),
        data: input.data,
      },
      null,
      2,
    )}\n`,
    contentType: "application/json",
  });
}

export async function writeReviewSnapshotForWorkspace(input: {
  workspace: CreativeWorkspace;
  artifact: "product-brief" | "storyboard";
  status: "proposed" | "approved";
  schemaVersion: string;
  data: unknown;
}) {
  await writeReviewSnapshot({
    workspace: input.workspace,
    artifact: input.artifact,
    status: input.status,
    schemaVersion: input.schemaVersion,
    data: input.data,
  });
}
