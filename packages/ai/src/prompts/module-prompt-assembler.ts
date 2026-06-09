import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export type PromptModuleId =
  | "prompt-requirements"
  | "material-intake"
  | "product-brief"
  | "storyboard"
  | "shotprompt"
  | "image-prompt"
  | "video-script";

export interface ModulePromptAssemblyMetadata {
  moduleId: PromptModuleId;
  assemblerVersion: "module-prompt-assembler";
  subjectTemplateId: string;
  contractTemplateId: string;
  subjectHash: string;
  contractHash: string;
}

export interface BuildModulePromptInput {
  moduleId: PromptModuleId;
  runtimeContext: string;
}

export interface BuildModulePromptResult {
  prompt: string;
  metadata: ModulePromptAssemblyMetadata;
}

const here = path.dirname(fileURLToPath(import.meta.url));

function sha256(input: string) {
  return createHash("sha256").update(input).digest("hex");
}

function templatePath(moduleId: PromptModuleId, part: "subject" | "contract") {
  return path.join(here, "modules", moduleId, `${part}.md`);
}

function templateId(moduleId: PromptModuleId, part: "subject" | "contract") {
  return `${moduleId}/${part}.md`;
}

function loadTemplate(moduleId: PromptModuleId, part: "subject" | "contract") {
  return readFileSync(templatePath(moduleId, part), "utf8").trim();
}

export function getModulePromptAssemblyMetadata(
  moduleId: PromptModuleId,
): ModulePromptAssemblyMetadata {
  const subject = loadTemplate(moduleId, "subject");
  const contract = loadTemplate(moduleId, "contract");
  return {
    moduleId,
    assemblerVersion: "module-prompt-assembler",
    subjectTemplateId: templateId(moduleId, "subject"),
    contractTemplateId: templateId(moduleId, "contract"),
    subjectHash: sha256(subject),
    contractHash: sha256(contract),
  };
}

export function buildModulePrompt(
  input: BuildModulePromptInput,
): BuildModulePromptResult {
  const subject = loadTemplate(input.moduleId, "subject");
  const contract = loadTemplate(input.moduleId, "contract");
  return {
    prompt: [
      "## Subject Prompt",
      subject,
      "",
      "## Runtime Context",
      input.runtimeContext.trim(),
      "",
      "## Schema Contract",
      contract,
    ].join("\n"),
    metadata: getModulePromptAssemblyMetadata(input.moduleId),
  };
}
