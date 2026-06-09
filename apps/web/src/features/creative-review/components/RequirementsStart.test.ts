import assert from "node:assert/strict";
import { describe, it } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  buildCreativeFactorRequirements,
  type CreativeFactors
} from "@aigc-video/shared";
import type { PromptRequirementsData } from "../../../lib/api/client.js";
import type { WorkbenchViewModel } from "../../workbench/useWorkbenchViewModel.js";
import {
  promptRequirementsDataFromForm,
  requirementFormFromArtifact,
  requirementFormWithCreativeFactors
} from "../requirementsForm.js";
import { RequirementsStart } from "./RequirementsStart.js";

const SAMPLE_FACTORS: CreativeFactors = {
  productCategory: "consumer-electronics",
  dealType: "search-standard",
  audience: "youth",
  strategy: "review-comparison"
};

function requirementsVm(
  data: PromptRequirementsData,
  options: { assetCount?: number; busy?: boolean } = {}
) {
  return {
    workspaceId: "workspace_123",
    materialLibrary: {
      assets: Array.from({ length: options.assetCount ?? 0 }, (_, index) => ({
        ref: `asset_${index + 1}`
      }))
    },
    artifacts: {
      promptRequirements: {
        id: "req_123",
        isCurrent: false,
        data
      }
    },
    busy: options.busy ?? false,
    actions: {
      refresh: async () => {},
      startCreativeReview: () => {}
    }
  } as unknown as WorkbenchViewModel;
}

function renderRequirements(
  data: PromptRequirementsData,
  options?: Parameters<typeof requirementsVm>[1]
) {
  return renderToStaticMarkup(
    React.createElement(RequirementsStart, {
      vm: requirementsVm(data, options),
      onActionComplete() {}
    })
  );
}

function submitButtonMarkup(html: string) {
  const buttons = html.match(/<button\b[^>]*>[\s\S]*?<\/button>/g) ?? [];
  const submitButton = buttons.find((button) => button.includes("提交创作要求"));
  assert.ok(submitButton, "expected submit requirements button to render");
  return submitButton;
}

function reviewActionDockMarkup(html: string) {
  const dock = html.match(/<div class="review-action-dock">[\s\S]*?<\/div>/)?.[0];
  assert.ok(dock, "expected review action dock to render");
  return dock;
}

describe("RequirementsStart", () => {
  it("does not render the preset module or legacy preset status", () => {
    const data = {
      ...buildCreativeFactorRequirements(SAMPLE_FACTORS),
      creativeRequirementTemplate: {
        source: "factor-preset",
        presetId: "preset_123",
        presetNameSnapshot: "3C 搜索测评",
        presetVersion: "factor-preset.2026-06",
        status: "selected"
      }
    } as PromptRequirementsData;
    const html = renderRequirements(data);

    assert.doesNotMatch(html, /创作要求预设/);
    assert.doesNotMatch(html, /当前预设/);
    assert.doesNotMatch(html, /3C 搜索测评/);
  });

  it("keeps submit clickable for an unsaved material requirement", () => {
    const form = requirementFormWithCreativeFactors(SAMPLE_FACTORS);
    const html = renderRequirements(promptRequirementsDataFromForm(form), {
      assetCount: 0
    });

    const submitButton = submitButtonMarkup(html);
    const dock = reviewActionDockMarkup(html);

    assert.doesNotMatch(submitButton, /\sdisabled(=|\s|>)/);
    assert.match(dock, /提交创作要求/);
    assert.doesNotMatch(html, /class="review-panel__actions"[\s\S]*提交创作要求/);
    assert.match(html, /请先上传至少一个商品素材/);
  });

  it("renders four factor selectors, editable guidance fields, and read-only compiled requirements", () => {
    const form = requirementFormWithCreativeFactors(SAMPLE_FACTORS);
    const html = renderRequirements(promptRequirementsDataFromForm(form));

    assert.match(html, /商品一级类目/);
    assert.match(html, /商品成交类型/);
    assert.match(html, /3C数码/);
    assert.match(html, /搜索型标品/);
    assert.match(html, /青年/);
    assert.match(html, /测评对比/);
    assert.doesNotMatch(html, /creative-factor-select-card__impact/);
    assert.doesNotMatch(html, /MuiFormHelperText-root/);
    assert.match(html, /细分字段/);
    assert.match(html, /商品一级类目/);
    assert.doesNotMatch(html, /镜头与剪辑语法/);
    assert.doesNotMatch(html, /提示包/);
    assert.doesNotMatch(html, /归因版本/);
    assert.doesNotMatch(html, /Hash/);
    assert.doesNotMatch(html, /fnv1a:/);
    assert.match(html, /全局创作要求/);
    assert.match(html, /只读/);
    assert.doesNotMatch(html, /必见视觉要素[\s\S]*?<textarea rows="2" readonly/);
    assert.doesNotMatch(html, /证据阈值/);
    assert.doesNotMatch(html, /影响 图像风格/);
    assert.match(html, /由 4 个细分字段编译/);
    assert.doesNotMatch(html, /图像风格（只读）/);
    assert.doesNotMatch(
      html,
      /影响 图像风格、图像构图、分镜节奏、分镜图全局要求、分镜视频全局要求、图像构图/
    );
  });

  it("marks detailed factor headings and field labels for hierarchy styling", () => {
    const form = requirementFormWithCreativeFactors(SAMPLE_FACTORS);
    const html = renderRequirements(promptRequirementsDataFromForm(form));

    assert.match(
      html,
      /class="creative-factor-group__title"[\s\S]*商品一级类目/
    );
    assert.match(
      html,
      /class="creative-factor-group__title"[\s\S]*商品成交类型/
    );
    assert.match(
      html,
      /class="creative-factor-field__label"[\s\S]*必见视觉要素/
    );
    assert.match(
      html,
      /class="creative-factor-field__label"[\s\S]*购买任务/
    );
  });

  it("rehydrates saved editable guidance fields and recompiles derived requirements", () => {
    const canonical = buildCreativeFactorRequirements(SAMPLE_FACTORS);
    const tampered = {
      ...canonical,
      image: { ...canonical.image, style: ["用户手写图像风格"] },
      factorGuidance: {
        ...canonical.factorGuidance,
        productCategory: {
          ...canonical.factorGuidance.productCategory,
          requiredVisualElements: ["用户手写主体呈现"]
        }
      }
    };
    const form = requirementFormFromArtifact(tampered as PromptRequirementsData);

    assert.deepEqual(form.creativeFactors, SAMPLE_FACTORS);
    assert.notEqual(form.imageStyle, "用户手写图像风格");
    assert.deepEqual(form.factorGuidance.productCategory.requiredVisualElements, [
      "用户手写主体呈现"
    ]);
    assert.match(form.imageComposition, /用户手写主体呈现/);
    assert.equal(form.factorComboKey, canonical.factorComboKey);
    assert.notEqual(form.compiledRequirementsHash, canonical.compiledRequirementsHash);
  });
});
