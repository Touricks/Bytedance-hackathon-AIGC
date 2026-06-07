import assert from "node:assert/strict";
import { describe, it } from "node:test";
import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderToStaticMarkup } from "react-dom/server";
import type { CreativeFactors } from "@aigc-video/shared";
import type { WorkbenchViewModel } from "../../workbench/useWorkbenchViewModel.js";
import type { PromptRequirementsData } from "../../../lib/api/client.js";
import {
  promptRequirementsDataFromForm,
  requirementFormWithCreativeFactors,
} from "../requirementsForm.js";
import { RequirementsStart } from "./RequirementsStart.js";

const DETACHED_FACTORS: CreativeFactors = {
  productType: "consumable-good",
  audience: "toddler",
  strategy: "emotional-story",
  visualStyle: "authentic",
};

function requirementsVm(
  data: PromptRequirementsData,
  options: { assetCount?: number; busy?: boolean } = {},
) {
  return {
    workspaceId: "workspace_123",
    materialLibrary: {
      assets: Array.from({ length: options.assetCount ?? 0 }, (_, index) => ({
        ref: `asset_${index + 1}`,
      })),
    },
    artifacts: {
      promptRequirements: {
        id: "req_123",
        isCurrent: false,
        data,
      },
    },
    busy: options.busy ?? false,
    actions: {
      refresh: async () => {},
      proposePromptRequirements: async () => {},
    },
  } as unknown as WorkbenchViewModel;
}

function renderRequirements(
  data: PromptRequirementsData,
  options?: Parameters<typeof requirementsVm>[1],
) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  queryClient.setQueryData(["creative-requirement-templates"], { templates: [] });

  return renderToStaticMarkup(
    React.createElement(
      QueryClientProvider,
      { client: queryClient },
      React.createElement(RequirementsStart, {
        vm: requirementsVm(data, options),
        onActionComplete() {},
      }),
    ),
  );
}

function submitButtonMarkup(html: string) {
  const buttons = html.match(/<button\b[^>]*>[\s\S]*?<\/button>/g) ?? [];
  const submitButton = buttons.find((button) => button.includes("提交创作要求"));
  assert.ok(submitButton, "expected submit requirements button to render");
  return submitButton;
}

describe("RequirementsStart", () => {
  it("hides the current template section after template factors are detached", () => {
    const form = requirementFormWithCreativeFactors(DETACHED_FACTORS, {
      creativeRequirementTemplate: {
        source: "setup-template",
        templateId: "template_123",
        templateNameSnapshot: "银发滋补·老年",
        templateVersion: "p0-2026-06",
        status: "detached",
      },
    });
    const html = renderRequirements(promptRequirementsDataFromForm(form));

    assert.doesNotMatch(html, /当前模板/);
    assert.doesNotMatch(html, /已替换主因子|已更换主因子|已套用|已修改细分字段/);
    assert.doesNotMatch(html, /银发滋补·老年/);
  });

  it("renders only the current template name without version metadata", () => {
    const form = requirementFormWithCreativeFactors(DETACHED_FACTORS, {
      creativeRequirementTemplate: {
        source: "setup-template",
        templateId: "template_123",
        templateNameSnapshot: "银发滋补·老年",
        templateVersion: "p0-2026-06",
        status: "applied",
      },
    });
    const html = renderRequirements(promptRequirementsDataFromForm(form));

    assert.match(html, /当前模板/);
    assert.match(html, /银发滋补·老年/);
    assert.doesNotMatch(html, /p0-2026-06/);
    assert.doesNotMatch(html, /已替换主因子|已更换主因子|已套用|已修改细分字段/);
  });

  it("keeps submit clickable for an unsaved material requirement and explains missing material on click", () => {
    const form = requirementFormWithCreativeFactors(DETACHED_FACTORS);
    const html = renderRequirements(promptRequirementsDataFromForm(form), {
      assetCount: 0,
    });

    const submitButton = submitButtonMarkup(html);

    assert.doesNotMatch(submitButton, /\sdisabled(=|\s|>)/);
    assert.match(html, /请先上传至少一个商品素材/);
  });
});
