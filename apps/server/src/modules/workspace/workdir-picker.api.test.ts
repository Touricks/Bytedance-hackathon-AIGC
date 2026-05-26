import assert from "node:assert/strict";
import { after, describe, it } from "node:test";
import type { FastifyInstance } from "fastify";
import { buildServer } from "../../app.js";

describe("workspace directory picker API", () => {
  let app: FastifyInstance;

  after(async () => {
    await app.close();
  });

  it("returns the selected local directory through Fastify", async () => {
    app = await buildServer({
      selectWorkspaceDirectory: async () => ({
        directory: "/tmp/project-workspace",
        cancelled: false,
        method: "macos"
      })
    });

    const response = await app.inject({
      method: "POST",
      url: "/api/workspaces/directory/select"
    });

    assert.equal(response.statusCode, 200, response.body);
    assert.deepEqual(response.json(), {
      directory: "/tmp/project-workspace",
      cancelled: false,
      method: "macos"
    });
  });
});
