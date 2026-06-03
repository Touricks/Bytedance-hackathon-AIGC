import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ProductBriefArtifact } from "@aigc-video/shared";
import {
  briefToForm,
  buildProductBriefRegenerationInput,
  formToBrief,
} from "./productBriefForm.js";

const brief: ProductBriefArtifact = {
  product: {
    name: "旧商品名",
    category: "家居装饰",
    keyFacts: ["复古桥梁画面"],
    assets: [{ ref: "product.png", useAs: "primary" }],
  },
  audience: {
    who: "喜欢旅行纪念品的用户",
    painOrDesire: "想要有纪念意义的装饰",
  },
  coreSellingPoint: "旧核心卖点",
  proof: ["旧证明"],
  offer: null,
  platform: "抖音",
  brandTone: "清新自然",
  bannedExpressions: ["最高级"],
  landingInfo: null,
  assumptions: ["旧假设"],
};

describe("product brief form helpers", () => {
  it("turns the current form into the draft used for merchant regeneration", () => {
    const form = briefToForm(brief);
    form.productName = "页面里改过的商品名";
    form.coreSellingPoint = "更突出送礼场景";
    form.keyFacts = "礼物场景\n年轻化语气";
    form.proof = "主图展示复古桥梁\n适合家居陈列";
    form.offer = "前100名赠送配件包";
    form.assumptions = "用户希望购买有纪念意义的风景装饰画";

    const input = buildProductBriefRegenerationInput({
      artifactId: "brief_current_123",
      brief,
      form,
      userDirection: "  语气更年轻，少一点材质描述  ",
    });

    assert.equal(input.baseArtifactId, "brief_current_123");
    assert.equal(input.userDirection, "语气更年轻，少一点材质描述");
    assert.equal(input.draft?.product.name, "页面里改过的商品名");
    assert.equal(input.draft?.coreSellingPoint, "更突出送礼场景");
    assert.deepEqual(input.draft?.product.keyFacts, ["礼物场景", "年轻化语气"]);
    assert.deepEqual(input.draft?.proof, ["主图展示复古桥梁", "适合家居陈列"]);
    assert.equal(input.draft?.offer, "前100名赠送配件包");
    assert.deepEqual(input.draft?.assumptions, [
      "用户希望购买有纪念意义的风景装饰画",
    ]);
  });

  it("keeps the form-to-brief conversion complete for approval", () => {
    const form = briefToForm(brief);
    form.offer = "";
    form.landingInfo = "点击小黄车下单";

    const draft = formToBrief(form, brief);

    assert.equal(draft.offer, null);
    assert.equal(draft.landingInfo, "点击小黄车下单");
    assert.deepEqual(draft.bannedExpressions, ["最高级"]);
  });
});
