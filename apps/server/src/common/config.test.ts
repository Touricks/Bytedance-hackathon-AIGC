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
  delete env.UPLOAD_URL_PREFIX;
  delete env.DASHBOARD_ASSET_DIR;
  delete env.TRACE_S3_ARCHIVE_ENABLED;
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

  it("loads current runtime config without legacy upload env", () => {
    const result = spawnSync(
      tsxBin,
      [
        "--eval",
        `import(${JSON.stringify(configModuleUrl)})
          .then(({ config }) => {
            console.log(JSON.stringify({
              uploadDir: config.uploadDir ?? null,
              uploadUrlPrefix: config.uploadUrlPrefix ?? null
            }));
          })
          .catch((error) => {
            console.error(error instanceof Error ? error.message : String(error));
            process.exit(1);
          });`
      ],
      {
        cwd: process.cwd(),
        env: {
          ...withoutDatabaseEnv(),
          AIGC_VIDEO_SKIP_ENV_FILE: "true",
          DATABASE_URL: "postgres://env-user:env-pass@localhost:5432/env_db"
        },
        encoding: "utf8"
      }
    );

    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(JSON.parse(result.stdout), {
      uploadDir: null,
      uploadUrlPrefix: null
    });
  });

  it("rejects cloud URLs in UPLOAD_DIR for the local storage adapter", () => {
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
          AIGC_VIDEO_SKIP_ENV_FILE: "true",
          DATABASE_URL: "postgres://env-user:env-pass@localhost:5432/env_db",
          UPLOAD_DIR: "s3://bucket/uploads",
          UPLOAD_URL_PREFIX: "/uploads"
        },
        encoding: "utf8"
      }
    );

    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /UPLOAD_DIR must be a local filesystem path/);
    assert.match(result.stderr, /object-storage adapter/);
  });

  it("fails loudly when only one legacy upload env value is configured", () => {
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
          AIGC_VIDEO_SKIP_ENV_FILE: "true",
          DATABASE_URL: "postgres://env-user:env-pass@localhost:5432/env_db",
          UPLOAD_DIR: "storage/uploads"
        },
        encoding: "utf8"
      }
    );

    assert.notEqual(result.status, 0);
    assert.match(
      result.stderr,
      /UPLOAD_DIR and UPLOAD_URL_PREFIX must be configured together/
    );
  });

  it("loads DATABASE_URL from the nearest workspace .env file", () => {
    const fixtureDir = path.join(
      tmpdir(),
      `aigc-video-config-${Date.now()}-${Math.random().toString(36).slice(2)}`
    );
    mkdirSync(fixtureDir, { recursive: true });
    writeFileSync(
      path.join(fixtureDir, ".env"),
      [
        "DATABASE_URL=postgres://env-file-user:env-file-pass@localhost:5432/env_file_db",
        `UPLOAD_DIR=${path.join(fixtureDir, "uploads")}`,
        "UPLOAD_URL_PREFIX=/uploads",
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
        "UPLOAD_DIR=storage/uploads",
        "UPLOAD_URL_PREFIX=/uploads",
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
        path.join(resolvedFixtureDir, "storage", "uploads")
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
        "UPLOAD_URL_PREFIX=/uploads",
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

  it("candidate and concurrency config exposes distinct limits", () => {
    const result = spawnSync(
      tsxBin,
      [
        "--eval",
        `import(${JSON.stringify(configModuleUrl)})
          .then(({ config }) => {
            console.log(JSON.stringify({
              defaultImageCandidates: config.defaultImageCandidates,
              maxImageCandidatesPerShot: config.maxImageCandidatesPerShot,
              defaultVideoCandidates: config.defaultVideoCandidates,
              maxVideoCandidatesPerShot: config.maxVideoCandidatesPerShot,
              generationWorkerConcurrency: config.generationWorkerConcurrency,
              textProviderConcurrency: config.textProviderConcurrency,
              imageProviderConcurrency: config.imageProviderConcurrency,
              videoProviderConcurrency: config.videoProviderConcurrency
            }));
          })
          .catch((error) => {
            console.error(error instanceof Error ? error.message : String(error));
            process.exit(1);
          });`
      ],
      {
        cwd: process.cwd(),
        env: {
          ...withoutDatabaseEnv(),
          AIGC_VIDEO_SKIP_ENV_FILE: "true",
          DATABASE_URL: "postgres://env-user:env-pass@localhost:5432/env_db",
          DEFAULT_IMAGE_CANDIDATES: "4",
          MAX_IMAGE_CANDIDATES_PER_SHOT: "7",
          DEFAULT_VIDEO_CANDIDATES: "3",
          MAX_VIDEO_CANDIDATES_PER_SHOT: "6",
          TEXT_PROVIDER_CONCURRENCY: "21",
          IMAGE_PROVIDER_CONCURRENCY: "13",
          VIDEO_PROVIDER_CONCURRENCY: "8",
          GENERATION_WORKER_CONCURRENCY: "22"
        },
        encoding: "utf8"
      }
    );

    assert.equal(result.status, 0, result.stderr);
    const out = JSON.parse(result.stdout);
    assert.deepEqual(out, {
      defaultImageCandidates: 4,
      maxImageCandidatesPerShot: 7,
      defaultVideoCandidates: 3,
      maxVideoCandidatesPerShot: 6,
      generationWorkerConcurrency: 22,
      textProviderConcurrency: 21,
      imageProviderConcurrency: 13,
      videoProviderConcurrency: 8
    });
  });

  it("defaults image provider concurrency to twice max image candidates and ignores legacy batch env", () => {
    const legacyDefaultImageBatchEnv = ["DEFAULT", "IMAGE", "BATCH", "SIZE"].join("_");
    const legacyMaxImageBatchEnv = ["MAX", "IMAGE", "BATCH", "SIZE"].join("_");
    const legacyDefaultImageBatchField = ["default", "Image", "Batch", "Size"].join("");
    const result = spawnSync(
      tsxBin,
      [
        "--eval",
        `import(${JSON.stringify(configModuleUrl)})
          .then(({ config }) => {
            console.log(JSON.stringify({
              maxImageCandidatesPerShot: config.maxImageCandidatesPerShot,
              imageProviderConcurrency: config.imageProviderConcurrency,
              generationWorkerConcurrency: config.generationWorkerConcurrency,
              legacyDefaultImageBatchField: config[${JSON.stringify(legacyDefaultImageBatchField)}] ?? null
            }));
          })
          .catch((error) => {
            console.error(error instanceof Error ? error.message : String(error));
            process.exit(1);
          });`
      ],
      {
        cwd: process.cwd(),
        env: {
          ...withoutDatabaseEnv(),
          AIGC_VIDEO_SKIP_ENV_FILE: "true",
          DATABASE_URL: "postgres://env-user:env-pass@localhost:5432/env_db",
          [legacyDefaultImageBatchEnv]: "99",
          [legacyMaxImageBatchEnv]: "99",
          MAX_IMAGE_CANDIDATES_PER_SHOT: "7"
        },
        encoding: "utf8"
      }
    );

    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(JSON.parse(result.stdout), {
      maxImageCandidatesPerShot: 7,
      imageProviderConcurrency: 14,
      generationWorkerConcurrency: 19,
      legacyDefaultImageBatchField: null
    });
  });

  it("loads and normalizes the upload URL prefix separately from UPLOAD_DIR", () => {
    const fixtureDir = path.join(
      tmpdir(),
      `aigc-video-config-${Date.now()}-${Math.random().toString(36).slice(2)}`
    );
    mkdirSync(fixtureDir, { recursive: true });
    writeFileSync(
      path.join(fixtureDir, ".env"),
      [
        "DATABASE_URL=postgres://env-file-user:env-file-pass@localhost:5432/env_file_db",
        "UPLOAD_DIR=storage/uploads",
        "UPLOAD_URL_PREFIX=/assets/uploads/",
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
              console.log(config.uploadUrlPrefix);
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
      assert.equal(result.stdout.trim(), "/assets/uploads");
    } finally {
      rmSync(fixtureDir, { recursive: true, force: true });
    }
  });
});
