import {
  getCreativeRequirementTemplates,
  type CreativeRequirementTemplate,
} from "@aigc-video/shared";

export function validateCreativeRequirementTemplatesForStartup(
  templates?: unknown,
): CreativeRequirementTemplate[] {
  return getCreativeRequirementTemplates(templates);
}

const creativeRequirementTemplates = validateCreativeRequirementTemplatesForStartup();

export const setupTemplateService = {
  listCreativeRequirementTemplates() {
    return {
      templates: creativeRequirementTemplates,
    };
  },
};
