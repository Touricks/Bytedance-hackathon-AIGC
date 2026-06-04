import type { ProductBriefArtifact } from "@aigc-video/shared";
import type { ProposeWorkspaceBriefInput } from "../../lib/api/client.js";

export type ProductBriefFormState = {
  productName: string;
  category: string;
  coreSellingPoint: string;
  audienceWho: string;
  audiencePainOrDesire: string;
  brandTone: string;
  platform: string;
  keyFacts: string;
  proof: string;
  bannedExpressions: string;
  offer: string;
  landingInfo: string;
  assumptions: string;
};

function linesFromText(value: string) {
  return value
    .split(/\n/)
    .map((item) => item.trim())
    .filter(Boolean);
}

export function briefToForm(brief: ProductBriefArtifact): ProductBriefFormState {
  return {
    productName: brief.product.name,
    category: brief.product.category,
    coreSellingPoint: brief.coreSellingPoint,
    audienceWho: brief.audience.who,
    audiencePainOrDesire: brief.audience.painOrDesire,
    brandTone: brief.brandTone,
    platform: brief.platform,
    keyFacts: brief.product.keyFacts.join("\n"),
    proof: brief.proof.join("\n"),
    bannedExpressions: brief.bannedExpressions.join("\n"),
    offer: brief.offer ?? "",
    landingInfo: brief.landingInfo ?? "",
    assumptions: brief.assumptions.join("\n"),
  };
}

export function formToBrief(
  form: ProductBriefFormState,
  current: ProductBriefArtifact,
): ProductBriefArtifact {
  return {
    ...current,
    product: {
      ...current.product,
      name: form.productName.trim(),
      category: form.category.trim(),
      keyFacts: linesFromText(form.keyFacts),
    },
    audience: {
      ...current.audience,
      who: form.audienceWho.trim(),
      painOrDesire: form.audiencePainOrDesire.trim(),
    },
    coreSellingPoint: form.coreSellingPoint.trim(),
    proof: linesFromText(form.proof),
    offer: form.offer.trim() || null,
    platform: form.platform.trim(),
    brandTone: form.brandTone.trim(),
    bannedExpressions: linesFromText(form.bannedExpressions),
    landingInfo: form.landingInfo.trim() || null,
    assumptions: linesFromText(form.assumptions),
  };
}

export function buildProductBriefRegenerationInput({
  artifactId,
  brief,
  form,
  userDirection,
}: {
  artifactId: string;
  brief: ProductBriefArtifact;
  form: ProductBriefFormState;
  userDirection: string;
}): Omit<ProposeWorkspaceBriefInput, "workspaceId"> {
  return {
    baseArtifactId: artifactId,
    userDirection: userDirection.trim(),
    draft: formToBrief(form, brief),
  };
}
