import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import type { CreativeWorkspace } from "@aigc-video/shared";
import {
  App,
  ArtifactFormEditor,
  MaterialImportStrip,
  PromptPreview,
  validateArtifactRequiredFields,
} from "./App.js";
import { JobProgress } from "../features/creation/JobProgress.js";
import type { WorkspaceMaterialLibrary } from "../lib/api/client.js";

describe("V1 workspace shell", () => {
  it("frames the first screen as a workspace resume entry without managed creation controls", () => {
    const queryClient = new QueryClient();
    const html = renderToString(
      createElement(
        QueryClientProvider,
        { client: queryClient },
        createElement(App)
      )
    );

    assert.match(html, /工作目录/);
    assert.match(html, /最近工作目录/);
    assert.match(html, /选择工作目录/);
    assert.match(html, /手动输入路径/);
    assert.match(html, /当前工作目录素材/);
    assert.match(html, /导入到当前工作目录/);
    assert.match(html, /select workspace/);
    assert.doesNotMatch(html, /工作目录入口/);
    assert.doesNotMatch(html, /工作目录名称/);
    assert.doesNotMatch(html, />新建</);
    assert.doesNotMatch(html, /class="status-strip"/);
    assert.doesNotMatch(html, /上传到当前工作目录/);
    assert.doesNotMatch(html, /工作目录素材库/);
  });

  it("renders runtime prompt previews from NL sections only", () => {
    const html = renderToString(
      createElement(PromptPreview, {
        promptView: {
          contractId: "material_intake",
          promptVersion: "material-intake.v1",
          provider: "deterministic",
          nl: {
            title: "Material intake prompt",
            sections: [
              {
                id: "role",
                label: "Role",
                body: "You are a material intake tagging builder."
              },
              {
                id: "selected_material_manifest",
                label: "Selected material manifest",
                body: "product.png"
              }
            ]
          },
          variables: {
            rawPayload: "data:image/png;base64,SHOULD_NOT_RENDER"
          }
        }
      })
    );

    assert.match(html, /Material intake prompt/);
    assert.match(html, /material-intake\.v1/);
    assert.match(html, /Selected material manifest/);
    assert.match(html, /product\.png/);
    assert.doesNotMatch(html, /SHOULD_NOT_RENDER/);
    assert.doesNotMatch(html, /rawPayload/);
  });

  it("keeps the material import strip compact even when candidates exist", () => {
    const workspace: CreativeWorkspace = {
      id: "workspace_123",
      localPath: "/Users/carrick/Campaigns/fanshi",
      currentScriptId: "script_123",
      status: "draft",
      traceFile: ".daireel/trace/events.jsonl",
      createdAt: "2026-05-26T00:00:00.000Z",
      updatedAt: "2026-05-26T00:00:00.000Z",
      lastSeenAt: "2026-05-26T00:00:00.000Z"
    };
    const library: WorkspaceMaterialLibrary = {
      scannedAt: "2026-05-26T00:00:00.000Z",
      primaryProductRef: "DSC03635.JPG",
      assets: [
        {
          ref: "DSC03635.JPG",
          kind: "image",
          mime: "image/jpeg",
          bytes: 128,
          sha256:
            "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
          role: "product_main",
          description: "Product main shot",
          relevance: "high",
          usable: true,
          included: true
        }
      ],
      rejected: [{ ref: "large.mov", reason: "Material file exceeds 50MB" }]
    };
    const html = renderToString(
      createElement(MaterialImportStrip, {
        busyAction: null,
        materialLibrary: library,
        selectedWorkspace: workspace,
        onImportMaterials: () => undefined
      })
    );

    assert.match(html, /当前工作目录素材/);
    assert.match(html, /导入到当前工作目录/);
    assert.doesNotMatch(html, /DSC03635\.JPG/);
    assert.doesNotMatch(html, /large\.mov/);
    assert.doesNotMatch(html, /usable/i);
    assert.doesNotMatch(html, /rejected/i);
  });

  it("renders field-level required errors without storyboard on-screen text fields", () => {
    const form = {
      artifactType: "storyboard" as const,
      artifactSchemaVersion: "ugc-storyboard.v1",
      fields: [
        {
          path: "narrative",
          label: "叙事主线",
          component: "textarea" as const,
          required: true
        },
        {
          path: "shots[].voiceover",
          label: "旁白",
          component: "textarea" as const,
          required: true
        },
        {
          path: "shots[].transition",
          label: "转场",
          component: "text" as const,
          required: true
        }
      ]
    };
    const data = {
      narrative: "",
      totalDurationSec: 12,
      shots: [
        {
          index: 0,
          purpose: "hook",
          durationSec: 3,
          scene: "Desk hook",
          visualDirection: "Show product",
          productAssetRef: "product.png",
          voiceover: "",
          transition: "cut"
        }
      ],
      assumptions: []
    };
    const fieldErrors = validateArtifactRequiredFields(data, form);
    const html = renderToString(
      createElement(ArtifactFormEditor, {
        data,
        form,
        emptyLabel: "等待 UGC 分镜",
        onChange: () => undefined,
        fieldErrors
      })
    );

    assert.match(html, /此项为必填项/);
    assert.match(html, /必填/);
    assert.doesNotMatch(html, /画面文字建议/);
    assert.doesNotMatch(html, /onScreenText/);
    assert.equal(fieldErrors.narrative, "此项为必填项");
    assert.equal(fieldErrors["shots.0.voiceover"], "此项为必填项");
  });

  it("moves workspace ids and next action into generation progress details", () => {
    const workspace: CreativeWorkspace = {
      id: "workspace_123",
      localPath: "/Users/carrick/Campaigns/fanshi",
      currentScriptId: "script_123",
      currentJobId: "job_123",
      status: "storyboard_proposed",
      traceFile: ".daireel/trace/events.jsonl",
      createdAt: "2026-05-26T00:00:00.000Z",
      updatedAt: "2026-05-26T00:00:00.000Z",
      lastSeenAt: "2026-05-26T00:00:00.000Z"
    };
    const html = renderToString(
      createElement(JobProgress, {
        job: undefined,
        nextAction: {
          stage: "storyboard",
          endpoint: "/api/workspaces/workspace_123/storyboard",
          method: "POST",
          actionType: "runtime_builder",
          runtimeBuilder: "storyboard",
          runtimeMode: "real",
          provider: "ark",
          requiresHumanApproval: false,
          willCallProvider: true,
          requiresProviderConfig: true
        },
        runtimeProviderLabel: "ark",
        workspace
      })
    );

    assert.match(html, /生成进度/);
    assert.match(html, /当前阶段/);
    assert.match(html, /storyboard/);
    assert.match(html, /下一步/);
    assert.match(html, /开发者信息/);
    assert.match(html, /workspace_123/);
    assert.match(html, /script_123/);
    assert.match(html, /job_123/);
    assert.match(html, /\/api\/workspaces\/workspace_123\/storyboard/);
  });
});
