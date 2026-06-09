import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export type PromptModuleId =
  | "prompt-requirements"
  | "material-intake"
  | "product-brief"
  | "storyboard"
  | "shotprompt";

export interface BuildModulePromptInput {
  moduleId: PromptModuleId;
  runtimeContext: string;
}

const here = path.dirname(fileURLToPath(import.meta.url));

function templatePath(moduleId: PromptModuleId, part: "subject" | "contract") {
  return path.join(here, "modules", moduleId, `${part}.md`);
}

function loadTemplate(moduleId: PromptModuleId, part: "subject" | "contract") {
  return readFileSync(templatePath(moduleId, part), "utf8").trim();
}

export function buildModulePrompt(input: BuildModulePromptInput): string {
  const subject = loadTemplate(input.moduleId, "subject");
  const contract = loadTemplate(input.moduleId, "contract");
  return [
    "## Subject Prompt",
    subject,
    "",
    "## Runtime Context",
    input.runtimeContext.trim(),
    "",
    "## Schema Contract",
    contract,
  ].join("\n");
}
