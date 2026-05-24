import assert from "node:assert/strict";
import { mkdirSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";
import { describe, it } from "node:test";

const configModuleUrl = pathToFileURL(path.resolve("src/common/config.ts")).href;
const tsxBin = path.resolve("node_modules/.bin/tsx");

function withoutDatabaseEnv() {
  const env = { ...process.env };
  delete env.DATABASE_URL;
  delete env.TEST_DATABASE_URL;
  delete env.UPLOAD_DIR;
  delete env.AIGC_VIDEO_SKIP_ENV_FILE;
  return env;
}

describe("server config", () => {
  it("fails loudly instead of falling back to in-memory persistence", () => {
    const result = spawnSync(
      tsxBin,
      [
        "--eval",
        `import(${JSON.stringify(configModuleUrl)})
          .then(() => process.exit(0))
          .catch((error) => {
            console.error(error instanceof Error ? error.message : String(error));
            process.exit(1);
          });`
      ],
      {
        cwd: process.cwd(),
        env: {
          ...withoutDatabaseEnv(),
          AIGC_VIDEO_SKIP_ENV_FILE: "true"
        },
        encoding: "utf8"
      }
    );

    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /DATABASE_URL is required/);
  });

  it("loads DATABASE_URL from the nearest workspace .env file", () => {
    const fixtureDir = path.join(
      tmpdir(),
      `aigc-video-config-${Date.now()}-${Math.random().toString(36).slice(2)}`
    );
    mkdirSync(fixtureDir, { recursive: true });
    writeFileSync(
      path.join(fixtureDir, ".env"),
      "DATABASE_URL=postgres://env-file-user:env-file-pass@localhost:5432/env_file_db\n"
    );

    try {
      const result = spawnSync(
        tsxBin,
        [
          "--eval",
          `import(${JSON.stringify(configModuleUrl)})
            .then(({ config }) => {
              console.log(config.databaseUrl);
            })
            .catch((error) => {
              console.error(error instanceof Error ? error.message : String(error));
              process.exit(1);
            });`
        ],
        {
          cwd: fixtureDir,
          env: withoutDatabaseEnv(),
          encoding: "utf8"
        }
      );

      assert.equal(result.status, 0, result.stderr);
      assert.equal(
        result.stdout.trim(),
        "postgres://env-file-user:env-file-pass@localhost:5432/env_file_db"
      );
    } finally {
      rmSync(fixtureDir, { recursive: true, force: true });
    }
  });

  it("resolves relative UPLOAD_DIR from the workspace .env root", () => {
    const fixtureDir = path.join(
      tmpdir(),
      `aigc-video-config-${Date.now()}-${Math.random().toString(36).slice(2)}`
    );
    const nestedServerDir = path.join(fixtureDir, "apps", "server");
    mkdirSync(nestedServerDir, { recursive: true });
    const resolvedFixtureDir = realpathSync(fixtureDir);
    writeFileSync(
      path.join(fixtureDir, ".env"),
      [
        "DATABASE_URL=postgres://env-file-user:env-file-pass@localhost:5432/env_file_db",
        "UPLOAD_DIR=tmp/uploads",
        ""
      ].join("\n")
    );

    try {
      const result = spawnSync(
        tsxBin,
        [
          "--eval",
          `import(${JSON.stringify(configModuleUrl)})
            .then(({ config }) => {
              console.log(config.uploadDir);
            })
            .catch((error) => {
              console.error(error instanceof Error ? error.message : String(error));
              process.exit(1);
            });`
        ],
        {
          cwd: nestedServerDir,
          env: withoutDatabaseEnv(),
          encoding: "utf8"
        }
      );

      assert.equal(result.status, 0, result.stderr);
      assert.equal(
        result.stdout.trim(),
        path.join(resolvedFixtureDir, "tmp", "uploads")
      );
    } finally {
      rmSync(fixtureDir, { recursive: true, force: true });
    }
  });

  it("keeps absolute UPLOAD_DIR values unchanged", () => {
    const fixtureDir = path.join(
      tmpdir(),
      `aigc-video-config-${Date.now()}-${Math.random().toString(36).slice(2)}`
    );
    const nestedServerDir = path.join(fixtureDir, "apps", "server");
    const uploadDir = path.join(fixtureDir, "custom-uploads");
    mkdirSync(nestedServerDir, { recursive: true });
    writeFileSync(
      path.join(fixtureDir, ".env"),
      [
        "DATABASE_URL=postgres://env-file-user:env-file-pass@localhost:5432/env_file_db",
        `UPLOAD_DIR=${uploadDir}`,
        ""
      ].join("\n")
    );

    try {
      const result = spawnSync(
        tsxBin,
        [
          "--eval",
          `import(${JSON.stringify(configModuleUrl)})
            .then(({ config }) => {
              console.log(config.uploadDir);
            })
            .catch((error) => {
              console.error(error instanceof Error ? error.message : String(error));
              process.exit(1);
            });`
        ],
        {
          cwd: nestedServerDir,
          env: withoutDatabaseEnv(),
          encoding: "utf8"
        }
      );

      assert.equal(result.status, 0, result.stderr);
      assert.equal(result.stdout.trim(), uploadDir);
    } finally {
      rmSync(fixtureDir, { recursive: true, force: true });
    }
  });
});
