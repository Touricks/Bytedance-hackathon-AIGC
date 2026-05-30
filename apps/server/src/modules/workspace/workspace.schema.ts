import { z } from "zod";
import {
  productBriefArtifactSchema,
  shotPromptArtifactSchema,
  storyboardArtifactSchema,
} from "@aigc-video/shared";

const workspaceDirectoryRequestBaseSchema = z.object({
  directory: z.string().min(1).optional(),
  workspaceId: z.string().min(1).optional(),
});

export const workspaceDirectoryRequestSchema =
  workspaceDirectoryRequestBaseSchema.refine(
    (value) => value.directory || value.workspaceId,
    {
      message: "workspaceId or directory is required",
    },
  );

export type WorkspaceDirectoryRequest = z.infer<
  typeof workspaceDirectoryRequestSchema
>;

export const managedWorkspaceCreateRequestSchema = z.object({
  name: z.string().min(1).max(80).optional(),
});

export const workspaceStorageBindRequestSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("local"),
    localPath: z.string().min(1),
  }),
  z.object({
    kind: z.literal("s3"),
    bucket: z.string().min(1),
    prefix: z.string().min(1),
    region: z.string().min(1).optional(),
    endpoint: z.string().min(1).optional(),
  }),
]);

export type WorkspaceStorageBindRequest = z.infer<
  typeof workspaceStorageBindRequestSchema
>;

export const workspaceMaterialUploadRequestSchema = z.object({
  workspaceId: z.string().min(1),
  filename: z.string().min(1).max(180),
  dataBase64: z.string().min(1),
});

export const materialIntakeRequestSchema = workspaceDirectoryRequestBaseSchema
  .extend({
    prompt: z.string().optional(),
    selectedMaterialRefs: z.array(z.string().min(1)).optional(),
  })
  .refine((value) => value.directory || value.workspaceId, {
    message: "workspaceId or directory is required",
  });

export const productBriefProposalRequestSchema =
  workspaceDirectoryRequestBaseSchema
    .extend({
      userDirection: z.string().optional(),
      title: z.string().min(1).optional(),
      sellingPoints: z.string().min(1).optional(),
      audience: z.string().min(1).optional(),
      stylePreference: z.string().optional(),
    })
    .refine((value) => value.directory || value.workspaceId, {
      message: "workspaceId or directory is required",
    });

export const productBriefApprovalRequestSchema =
  workspaceDirectoryRequestBaseSchema
    .extend({
      data: productBriefArtifactSchema,
    })
    .refine((value) => value.directory || value.workspaceId, {
      message: "workspaceId or directory is required",
    });

export const storyboardApprovalRequestSchema =
  workspaceDirectoryRequestBaseSchema
    .extend({
      data: storyboardArtifactSchema,
    })
    .refine((value) => value.directory || value.workspaceId, {
      message: "workspaceId or directory is required",
    });

export const shotPromptCompileRequestSchema =
  workspaceDirectoryRequestBaseSchema
    .extend({
      aspectRatio: z.enum(["9:16", "16:9", "1:1"]).optional(),
    })
    .refine((value) => value.directory || value.workspaceId, {
      message: "workspaceId or directory is required",
    });

export const shotPromptApprovalRequestSchema =
  workspaceDirectoryRequestBaseSchema
    .extend({
      data: shotPromptArtifactSchema,
    })
    .refine((value) => value.directory || value.workspaceId, {
      message: "workspaceId or directory is required",
    });

export const feedbackRouteRequestSchema = workspaceDirectoryRequestBaseSchema
  .extend({
    feedback: z.string().min(1),
    jobId: z.string().min(1).optional(),
  })
  .refine((value) => value.directory || value.workspaceId, {
    message: "workspaceId or directory is required",
  });

export const workspaceManifestSchema = z.object({
  schemaVersion: z.literal(1),
  workspaceId: z.string().min(1),
  currentScriptId: z.string().min(1),
  currentJobId: z.string().min(1).optional(),
  traceFile: z.literal(".daireel/trace/events.jsonl"),
});

export type WorkspaceManifest = z.infer<typeof workspaceManifestSchema>;
