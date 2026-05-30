import type { FastifyInstance } from "fastify";
import { toHttpError } from "../../common/errors.js";
import {
  feedbackRouteRequestSchema,
  materialIntakeRequestSchema,
  managedWorkspaceCreateRequestSchema,
  productBriefApprovalRequestSchema,
  productBriefProposalRequestSchema,
  shotPromptApprovalRequestSchema,
  shotPromptCompileRequestSchema,
  storyboardApprovalRequestSchema,
  workspaceStorageBindRequestSchema,
  workspaceMaterialUploadRequestSchema,
  workspaceDirectoryRequestSchema
} from "./workspace.schema.js";
import { workspaceService } from "./workspace.service.js";
import {
  selectWorkspaceDirectory,
  type WorkspaceDirectorySelectResponse
} from "./workdir-picker.js";

interface RegisterWorkspaceControllerOptions {
  selectWorkspaceDirectory?: () => Promise<WorkspaceDirectorySelectResponse>;
}

function multipartFieldValue(
  fields: Record<string, unknown>,
  fieldName: string,
) {
  const field = fields[fieldName];
  if (
    field &&
    !Array.isArray(field) &&
    typeof field === "object" &&
    "value" in field &&
    typeof field.value === "string"
  ) {
    return field.value;
  }
  return undefined;
}

export async function registerWorkspaceController(
  app: FastifyInstance,
  options: RegisterWorkspaceControllerOptions = {}
) {
  app.post("/api/workspaces/directory/select", async (_request, reply) => {
    try {
      return await (options.selectWorkspaceDirectory ?? selectWorkspaceDirectory)();
    } catch (error) {
      const httpError = toHttpError(error);
      return reply.status(httpError.statusCode).send(httpError);
    }
  });

  app.get("/api/workspaces", async (_request, reply) => {
    try {
      return await workspaceService.listManagedWorkspaces();
    } catch (error) {
      const httpError = toHttpError(error);
      return reply.status(httpError.statusCode).send(httpError);
    }
  });

  app.get("/api/workspaces/:workspaceId/directory", async (request, reply) => {
    try {
      const params = request.params as { workspaceId: string };
      return await workspaceService.getWorkspaceDirectory(params.workspaceId);
    } catch (error) {
      const httpError = toHttpError(error);
      return reply.status(httpError.statusCode).send(httpError);
    }
  });

  app.get("/api/workspaces/:workspaceId/storage", async (request, reply) => {
    try {
      const params = request.params as { workspaceId: string };
      return await workspaceService.getWorkspaceStorage(params.workspaceId);
    } catch (error) {
      const httpError = toHttpError(error);
      return reply.status(httpError.statusCode).send(httpError);
    }
  });

  app.post(
    "/api/workspaces/:workspaceId/storage/bind",
    async (request, reply) => {
      try {
        const params = request.params as { workspaceId: string };
        const body = workspaceStorageBindRequestSchema.parse(request.body);
        return await workspaceService.bindWorkspaceStorage(
          params.workspaceId,
          body,
        );
      } catch (error) {
        const httpError = toHttpError(error);
        return reply.status(httpError.statusCode).send(httpError);
      }
    },
  );

  app.post("/api/workspaces", async (request, reply) => {
    try {
      const body = managedWorkspaceCreateRequestSchema.parse(request.body);
      return await workspaceService.createManagedWorkspace(body.name);
    } catch (error) {
      const httpError = toHttpError(error);
      return reply.status(httpError.statusCode).send(httpError);
    }
  });

  app.post("/api/workspaces/materials", async (request, reply) => {
    try {
      if (request.isMultipart()) {
        const file = await request.file();
        if (!file) {
          throw new Error("Material file is required");
        }
        const workspaceId = multipartFieldValue(file.fields, "workspaceId");
        if (!workspaceId) {
          throw new Error("workspaceId is required");
        }
        return await workspaceService.uploadMaterial({
          workspaceId,
          filename: file.filename,
          bytes: await file.toBuffer(),
        });
      }

      const body = workspaceMaterialUploadRequestSchema.parse(request.body);
      return await workspaceService.uploadMaterial({
        workspaceId: body.workspaceId,
        filename: body.filename,
        bytes: Buffer.from(body.dataBase64, "base64"),
      });
    } catch (error) {
      const httpError = toHttpError(error);
      return reply.status(httpError.statusCode).send(httpError);
    }
  });

  app.post("/api/workspaces/init", async (request, reply) => {
    try {
      const body = workspaceDirectoryRequestSchema.parse(request.body);
      if (!body.directory) {
        throw new Error("directory is required to initialize a workspace");
      }
      return await workspaceService.initialize(body.directory);
    } catch (error) {
      const httpError = toHttpError(error);
      return reply.status(httpError.statusCode).send(httpError);
    }
  });

  app.post("/api/workspaces/status", async (request, reply) => {
    try {
      const body = workspaceDirectoryRequestSchema.parse(request.body);
      return await workspaceService.status(body);
    } catch (error) {
      const httpError = toHttpError(error);
      return reply.status(httpError.statusCode).send(httpError);
    }
  });

  app.post("/api/workspaces/material-intake", async (request, reply) => {
    try {
      const body = materialIntakeRequestSchema.parse(request.body);
      return await workspaceService.materialIntake(body, body.prompt);
    } catch (error) {
      const httpError = toHttpError(error);
      return reply.status(httpError.statusCode).send(httpError);
    }
  });

  app.post("/api/workspaces/brief/propose", async (request, reply) => {
    try {
      const body = productBriefProposalRequestSchema.parse(request.body);
      return await workspaceService.proposeBrief(body);
    } catch (error) {
      const httpError = toHttpError(error);
      return reply.status(httpError.statusCode).send(httpError);
    }
  });

  app.post("/api/workspaces/artifacts/brief/approve", async (request, reply) => {
    try {
      const body = productBriefApprovalRequestSchema.parse(request.body);
      return await workspaceService.approveBrief(body, body.data);
    } catch (error) {
      const httpError = toHttpError(error);
      return reply.status(httpError.statusCode).send(httpError);
    }
  });

  app.post("/api/workspaces/storyboard/propose", async (request, reply) => {
    try {
      const body = workspaceDirectoryRequestSchema.parse(request.body);
      return await workspaceService.proposeStoryboard(body);
    } catch (error) {
      const httpError = toHttpError(error);
      return reply.status(httpError.statusCode).send(httpError);
    }
  });

  app.post(
    "/api/workspaces/artifacts/storyboard/approve",
    async (request, reply) => {
      try {
        const body = storyboardApprovalRequestSchema.parse(request.body);
        return await workspaceService.approveStoryboard(body, body.data);
      } catch (error) {
        const httpError = toHttpError(error);
        return reply.status(httpError.statusCode).send(httpError);
      }
    }
  );

  app.post("/api/workspaces/shotprompt/compile", async (request, reply) => {
    try {
      const body = shotPromptCompileRequestSchema.parse(request.body);
      return await workspaceService.compileShotPrompt(body);
    } catch (error) {
      const httpError = toHttpError(error);
      return reply.status(httpError.statusCode).send(httpError);
    }
  });

  app.post(
    "/api/workspaces/artifacts/shotprompt/approve",
    async (request, reply) => {
      try {
        const body = shotPromptApprovalRequestSchema.parse(request.body);
        return await workspaceService.approveShotPrompt(body, body.data);
      } catch (error) {
        const httpError = toHttpError(error);
        return reply.status(httpError.statusCode).send(httpError);
      }
    }
  );

  app.post("/api/workspaces/feedback/route", async (request, reply) => {
    try {
      const body = feedbackRouteRequestSchema.parse(request.body);
      return await workspaceService.routeFeedback(body, body.feedback);
    } catch (error) {
      const httpError = toHttpError(error);
      return reply.status(httpError.statusCode).send(httpError);
    }
  });
}
