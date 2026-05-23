import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { describe, it } from "node:test";

const testDatabaseUrl =
  process.env.TEST_DATABASE_URL ??
  process.env.DATABASE_URL ??
  "postgres://postgres:postgres@localhost:5432/aigc_video";

function runServerSnippet(source: string) {
  const result = spawnSync(process.execPath, ["--import", "tsx", "--eval", source], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      DATABASE_URL: testDatabaseUrl,
      NODE_ENV: "test"
    },
    encoding: "utf8"
  });

  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout);
}

describe("creative blueprint durable persistence", () => {
  it("retrieves a creative blueprint by scriptId after the server process restarts", () => {
    const created = runServerSnippet(`
      const { buildServer } = await import("./src/app.ts");
      const app = await buildServer();
      const response = await app.inject({
        method: "POST",
        url: "/api/creative-blueprints",
        payload: {
          title: "Restart Safe Blender",
          sellingPoints: "keeps script ids durable",
          audience: "demo reviewers",
          stylePreference: "clean premium ecommerce",
          imageUrl: "/mocks/products/demo-product.svg"
        }
      });
      console.log(JSON.stringify(response.json()));
      await app.close();
    `);

    const hydrated = runServerSnippet(`
      const { buildServer } = await import("./src/app.ts");
      const app = await buildServer();
      const response = await app.inject({
        method: "GET",
        url: "/api/creative-blueprints/${created.scriptId}"
      });
      console.log(JSON.stringify({
        statusCode: response.statusCode,
        body: response.json()
      }));
      await app.close();
    `);

    assert.equal(hydrated.statusCode, 200);
    assert.equal(hydrated.body.scriptId, created.scriptId);
    assert.equal(hydrated.body.product.title, "Restart Safe Blender");
    assert.equal(hydrated.body.shots.length, 3);
  });
});
