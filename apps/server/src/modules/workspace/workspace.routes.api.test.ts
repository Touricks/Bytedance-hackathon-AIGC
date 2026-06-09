import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import type { FastifyInstance } from "fastify";
import { buildServer } from "../../app.js";

describe("current workspace module routes", () => {
  let app: FastifyInstance;

  before(async () => {
    app = await buildServer();
  });

  after(async () => {
    await app.close();
  });

  it("does not register deprecated workspace builder endpoints", async () => {
    const deprecatedRoutes = [
      "/api/workspaces/material-intake",
      "/api/workspaces/materials",
      "/api/workspaces/brief/propose",
      "/api/workspaces/artifacts/brief/approve",
      "/api/workspaces/storyboard/propose",
      "/api/workspaces/artifacts/storyboard/approve",
      "/api/workspaces/shotprompt/compile",
      "/api/workspaces/artifacts/shotprompt/approve",
      "/api/workspaces/feedback/route",
      "/api/workspaces/status",
    ];

    for (const url of deprecatedRoutes) {
      const response = await app.inject({
        method: "POST",
        url,
        payload: {},
      });
      assert.equal(response.statusCode, 404, `${url} should be removed`);
    }
  });
});
