import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { toHttpError } from "../../common/errors.js";
import {
  materialIntakeModuleProposeRequestSchema,
  moduleArtifactApprovalRequestSchema,
  productBriefModuleProposeRequestSchema,
  promptRequirementsProposeRequestSchema,
  shotPromptModuleProposeRequestSchema,
  shotSetCreateRequestSchema,
  storyboardModuleProposeRequestSchema,
  storyboardVoiceoverProposeRequestSchema,
  managedWorkspaceCreateRequestSchema,
  managedWorkspaceUpdateRequestSchema,
  workspaceStorageBindRequestSchema,
  workspaceMaterialUploadRequestSchema,
  workspaceDirectoryRequestSchema
} from "./workspace.schema.js";
import { materialIntakeService } from "./material-intake.service.js";
import { productBriefService } from "./product-brief.service.js";
import { promptRequirementsService } from "./prompt-requirements.service.js";
import { shotSetService } from "./shot-set.service.js";
import { shotPromptService } from "./shotprompt.service.js";
import { storyboardService } from "./storyboard.service.js";
import { workspaceService } from "./workspace.service.js";
import {
  selectWorkspaceDirectory,
  type WorkspaceDirectorySelectResponse
} from "./workdir-picker.js";

interface RegisterWorkspaceControllerOptions {
  selectWorkspaceDirectory?: () => Promise<WorkspaceDirectorySelectResponse>;
}

const WORKSPACE_ID_SEGMENT =
  ":workspaceId((?!artifacts$)[A-Za-z0-9_-]+)";

function workspaceRoute(path: string) {
  return `/api/workspaces/${WORKSPACE_ID_SEGMENT}${path}`;
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

  app.get(workspaceRoute("/directory"), async (request, reply) => {
    try {
      const params = request.params as { workspaceId: string };
      return await workspaceService.getWorkspaceDirectory(params.workspaceId);
    } catch (error) {
      const httpError = toHttpError(error);
      return reply.status(httpError.statusCode).send(httpError);
    }
  });

  app.get(workspaceRoute("/storage"), async (request, reply) => {
    try {
      const params = request.params as { workspaceId: string };
      return await workspaceService.getWorkspaceStorage(params.workspaceId);
    } catch (error) {
      const httpError = toHttpError(error);
      return reply.status(httpError.statusCode).send(httpError);
    }
  });

  app.get(workspaceRoute("/status"), async (request, reply) => {
    try {
      const params = request.params as { workspaceId: string };
      return await workspaceService.status({ workspaceId: params.workspaceId });
    } catch (error) {
      const httpError = toHttpError(error);
      return reply.status(httpError.statusCode).send(httpError);
    }
  });

  app.post(
    workspaceRoute("/storage/bind"),
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

  app.delete(workspaceRoute(""), async (request, reply) => {
    try {
      const params = request.params as { workspaceId: string };
      return await workspaceService.deleteWorkspace(params.workspaceId);
    } catch (error) {
      const httpError = toHttpError(error);
      return reply.status(httpError.statusCode).send(httpError);
    }
  });

  app.patch(workspaceRoute(""), async (request, reply) => {
    try {
      const params = request.params as { workspaceId: string };
      const body = managedWorkspaceUpdateRequestSchema.parse(request.body);
      return await workspaceService.updateWorkspaceDisplayName(
        params.workspaceId,
        body.displayName,
      );
    } catch (error) {
      const httpError = toHttpError(error);
      return reply.status(httpError.statusCode).send(httpError);
    }
  });

  app.get(
    workspaceRoute("/prompt-requirements"),
    async (request, reply) => {
      try {
        const params = request.params as { workspaceId: string };
        return {
          data: await promptRequirementsService.getState(params.workspaceId),
        };
      } catch (error) {
        const httpError = toHttpError(error);
        return reply.status(httpError.statusCode).send(httpError);
      }
    },
  );

  app.post(
    workspaceRoute("/prompt-requirements/propose"),
    async (request, reply) => {
      try {
        const params = request.params as { workspaceId: string };
        const body = promptRequirementsProposeRequestSchema.parse(request.body);
        return {
          data: await promptRequirementsService.propose(
            params.workspaceId,
            body.data,
          ),
        };
      } catch (error) {
        const httpError = toHttpError(error);
        return reply.status(httpError.statusCode).send(httpError);
      }
    },
  );

  app.post(
    workspaceRoute("/prompt-requirements/approve"),
    async (request, reply) => {
      try {
        const params = request.params as { workspaceId: string };
        const body = moduleArtifactApprovalRequestSchema.parse(request.body);
        return {
          data: await promptRequirementsService.approve({
            workspaceId: params.workspaceId,
            artifactId: body.artifactId,
            data: body.data,
          }),
        };
      } catch (error) {
        const httpError = toHttpError(error);
        return reply.status(httpError.statusCode).send(httpError);
      }
    },
  );

  app.get(
    workspaceRoute("/material-intake"),
    async (request, reply) => {
      try {
        const params = request.params as { workspaceId: string };
        return {
          data: await materialIntakeService.getState(params.workspaceId),
        };
      } catch (error) {
        const httpError = toHttpError(error);
        return reply.status(httpError.statusCode).send(httpError);
      }
    },
  );

  app.post(
    workspaceRoute("/material-intake/propose"),
    async (request, reply) => {
      try {
        const params = request.params as { workspaceId: string };
        const body = materialIntakeModuleProposeRequestSchema.parse(
          request.body,
        );
        return {
          data: await materialIntakeService.propose({
            workspaceId: params.workspaceId,
            selectedMaterialRefs: body.selectedMaterialRefs,
            userDirection: body.userDirection,
          }),
        };
      } catch (error) {
        const httpError = toHttpError(error);
        return reply.status(httpError.statusCode).send(httpError);
      }
    },
  );

  app.post(
    workspaceRoute("/material-intake/approve"),
    async (request, reply) => {
      try {
        const params = request.params as { workspaceId: string };
        const body = moduleArtifactApprovalRequestSchema.parse(request.body);
        return {
          data: await materialIntakeService.approve({
            workspaceId: params.workspaceId,
            artifactId: body.artifactId,
            data: body.data,
          }),
        };
      } catch (error) {
        const httpError = toHttpError(error);
        return reply.status(httpError.statusCode).send(httpError);
      }
    },
  );

  app.post(workspaceRoute("/materials"), async (request, reply) => {
    try {
      const params = request.params as { workspaceId: string };
      if (request.isMultipart()) {
        const file = await request.file();
        if (!file) {
          throw new Error("Material file is required");
        }
        return await workspaceService.uploadMaterial({
          workspaceId: params.workspaceId,
          filename: file.filename,
          bytes: await file.toBuffer(),
        });
      }

      const body = workspaceMaterialUploadRequestSchema
        .omit({ workspaceId: true })
        .parse(request.body);
      return await workspaceService.uploadMaterial({
        workspaceId: params.workspaceId,
        filename: body.filename,
        bytes: Buffer.from(body.dataBase64, "base64"),
      });
    } catch (error) {
      const httpError = toHttpError(error);
      return reply.status(httpError.statusCode).send(httpError);
    }
  });

  const deleteWorkspaceMaterial = async (
    request: FastifyRequest,
    reply: FastifyReply,
  ) => {
    try {
      const params = request.params as {
        workspaceId: string;
        ref?: string;
        "*": string;
      };
      return await workspaceService.deleteMaterial({
        workspaceId: params.workspaceId,
        ref: params.ref ?? params["*"],
      });
    } catch (error) {
      const httpError = toHttpError(error);
      return reply.status(httpError.statusCode).send(httpError);
    }
  };

  app.delete(workspaceRoute("/materials/:ref"), deleteWorkspaceMaterial);
  app.delete(workspaceRoute("/materials/*"), deleteWorkspaceMaterial);

  app.get(
    workspaceRoute("/product-brief"),
    async (request, reply) => {
      try {
        const params = request.params as { workspaceId: string };
        return {
          data: await productBriefService.getState(params.workspaceId),
        };
      } catch (error) {
        const httpError = toHttpError(error);
        return reply.status(httpError.statusCode).send(httpError);
      }
    },
  );

  app.post(
    workspaceRoute("/product-brief/propose"),
    async (request, reply) => {
      try {
        const params = request.params as { workspaceId: string };
        const body = productBriefModuleProposeRequestSchema.parse(request.body);
        return {
          data: await productBriefService.propose({
            workspaceId: params.workspaceId,
            ...body,
          }),
        };
      } catch (error) {
        const httpError = toHttpError(error);
        return reply.status(httpError.statusCode).send(httpError);
      }
    },
  );

  app.post(
    workspaceRoute("/product-brief/approve"),
    async (request, reply) => {
      try {
        const params = request.params as { workspaceId: string };
        const body = moduleArtifactApprovalRequestSchema.parse(request.body);
        return {
          data: await productBriefService.approve({
            workspaceId: params.workspaceId,
            artifactId: body.artifactId,
            data: body.data,
          }),
        };
      } catch (error) {
        const httpError = toHttpError(error);
        return reply.status(httpError.statusCode).send(httpError);
      }
    },
  );

  app.get(workspaceRoute("/storyboard"), async (request, reply) => {
    try {
      const params = request.params as { workspaceId: string };
      return {
        data: await storyboardService.getState(params.workspaceId),
      };
    } catch (error) {
      const httpError = toHttpError(error);
      return reply.status(httpError.statusCode).send(httpError);
    }
  });

  app.post(
    workspaceRoute("/storyboard/propose"),
    async (request, reply) => {
      try {
        const params = request.params as { workspaceId: string };
        storyboardModuleProposeRequestSchema.parse(request.body);
        return {
          data: await storyboardService.propose({
            workspaceId: params.workspaceId,
          }),
        };
      } catch (error) {
        const httpError = toHttpError(error);
        return reply.status(httpError.statusCode).send(httpError);
      }
    },
  );

  app.post(
    workspaceRoute("/storyboard/voiceover/propose"),
    async (request, reply) => {
      try {
        const params = request.params as { workspaceId: string };
        const body = storyboardVoiceoverProposeRequestSchema.parse(request.body);
        return {
          data: await storyboardService.proposeVoiceover({
            workspaceId: params.workspaceId,
            baseArtifactId: body.baseArtifactId,
            draft: body.draft,
            userDirection: body.userDirection,
          }),
        };
      } catch (error) {
        const httpError = toHttpError(error);
        return reply.status(httpError.statusCode).send(httpError);
      }
    },
  );

  app.post(
    workspaceRoute("/storyboard/approve"),
    async (request, reply) => {
      try {
        const params = request.params as { workspaceId: string };
        const body = moduleArtifactApprovalRequestSchema.parse(request.body);
        return {
          data: await storyboardService.approve({
            workspaceId: params.workspaceId,
            artifactId: body.artifactId,
            data: body.data,
          }),
        };
      } catch (error) {
        const httpError = toHttpError(error);
        return reply.status(httpError.statusCode).send(httpError);
      }
    },
  );

  app.get(workspaceRoute("/shotprompt"), async (request, reply) => {
    try {
      const params = request.params as { workspaceId: string };
      return {
        data: await shotPromptService.getState(params.workspaceId),
      };
    } catch (error) {
      const httpError = toHttpError(error);
      return reply.status(httpError.statusCode).send(httpError);
    }
  });

  app.post(
    workspaceRoute("/shotprompt/propose"),
    async (request, reply) => {
      try {
        const params = request.params as { workspaceId: string };
        const body = shotPromptModuleProposeRequestSchema.parse(request.body);
        return {
          data: await shotPromptService.propose({
            workspaceId: params.workspaceId,
            aspectRatio: body.aspectRatio,
          }),
        };
      } catch (error) {
        const httpError = toHttpError(error);
        return reply.status(httpError.statusCode).send(httpError);
      }
    },
  );

  app.post(
    workspaceRoute("/shotprompt/approve"),
    async (request, reply) => {
      try {
        const params = request.params as { workspaceId: string };
        const body = moduleArtifactApprovalRequestSchema.parse(request.body);
        return {
          data: await shotPromptService.approve({
            workspaceId: params.workspaceId,
            artifactId: body.artifactId,
            data: body.data,
          }),
        };
      } catch (error) {
        const httpError = toHttpError(error);
        return reply.status(httpError.statusCode).send(httpError);
      }
    },
  );

  app.get(workspaceRoute("/shot-sets"), async (request, reply) => {
    try {
      const params = request.params as { workspaceId: string };
      return {
        data: await shotSetService.listShotSets(params.workspaceId),
      };
    } catch (error) {
      const httpError = toHttpError(error);
      return reply.status(httpError.statusCode).send(httpError);
    }
  });

  app.get(workspaceRoute("/shot-sets/history"), async (request, reply) => {
    try {
      const params = request.params as { workspaceId: string };
      return {
        data: await shotSetService.listShotSetHistory(params.workspaceId),
      };
    } catch (error) {
      const httpError = toHttpError(error);
      return reply.status(httpError.statusCode).send(httpError);
    }
  });

  app.post(workspaceRoute("/shot-sets"), async (request, reply) => {
    try {
      const params = request.params as { workspaceId: string };
      const body = shotSetCreateRequestSchema.parse(request.body ?? {});
      return {
        data: await shotSetService.apply({
          workspaceId: params.workspaceId,
          shotPromptArtifactId: body.shotPromptArtifactId,
        }),
      };
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

}
