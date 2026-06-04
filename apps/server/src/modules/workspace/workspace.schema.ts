import { z } from "zod";
import {
  productBriefArtifactSchema,
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

export const promptRequirementsDataSchema = z
  .object({
    image: z.record(z.unknown()).optional(),
    script: z.record(z.unknown()).optional(),
    storyboard: z.record(z.unknown()).optional(),
    shotImage: z.record(z.unknown()).optional(),
    shotVideo: z.record(z.unknown()).optional(),
  })
  .passthrough();

export const promptRequirementsProposeRequestSchema = z.object({
  data: promptRequirementsDataSchema,
});

export const materialIntakeModuleProposeRequestSchema = z.object({
  selectedMaterialRefs: z.array(z.string().min(1)).optional(),
  userDirection: z.string().optional(),
});

export const productBriefModuleProposeRequestSchema = z.object({
  userDirection: z.string().trim().min(1).max(1000).optional(),
  title: z.string().min(1).optional(),
  sellingPoints: z.string().min(1).optional(),
  audience: z.string().min(1).optional(),
  stylePreference: z.string().optional(),
  draft: productBriefArtifactSchema.optional(),
  baseArtifactId: z.string().min(1).optional(),
}).superRefine((value, context) => {
  if ((value.draft || value.baseArtifactId) && !value.userDirection) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["userDirection"],
      message: "userDirection is required when regenerating a product brief draft",
    });
  }
});

export const storyboardModuleProposeRequestSchema = z.object({
  userDirection: z.string().optional(),
});

export const storyboardVoiceoverProposeRequestSchema = z.object({
  baseArtifactId: z.string().min(1).optional(),
  draft: storyboardArtifactSchema,
  userDirection: z.string().optional(),
});

export const shotPromptModuleProposeRequestSchema = z.object({
  aspectRatio: z.enum(["9:16", "16:9", "1:1"]).optional(),
});

export const shotSetCreateRequestSchema = z.object({
  shotPromptArtifactId: z.string().min(1).optional(),
});

export const moduleArtifactApprovalRequestSchema = z
  .object({
    artifactId: z.string().min(1).optional(),
    data: z.unknown().optional(),
  })
  .refine((value) => value.artifactId || value.data !== undefined, {
    message: "artifactId or data is required",
  });

export const workspaceManifestSchema = z.object({
  schemaVersion: z.literal(1),
  workspaceId: z.string().min(1),
  currentScriptId: z.string().min(1),
  currentJobId: z.string().min(1).optional(),
  traceFile: z.literal(".daireel/trace/events.jsonl"),
});

export type WorkspaceManifest = z.infer<typeof workspaceManifestSchema>;
