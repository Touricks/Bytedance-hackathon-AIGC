import type { DashboardAssistantPreset } from "./dashboardTypes.js";

export type ChipAction = "scroll-matrix" | "scroll-channel" | "send";

/** Route an assistant chip to a panel scroll or a chat send (ported from the design). */
export function classifyChip(chip: string): ChipAction {
  if (chip.includes("矩阵")) return "scroll-matrix";
  if (chip.includes("渠道对比")) return "scroll-channel";
  return "send";
}

/** Fuzzy-match a user question to a preset (exact match first, then keyword heuristics). */
export function matchPreset(
  presets: DashboardAssistantPreset[],
  question: string,
): DashboardAssistantPreset | undefined {
  const exact = presets.find((preset) => preset.question === question);
  if (exact) return exact;
  return presets.find((preset) => {
    if (question.includes("换") && question.includes("手法")) {
      return preset.question.includes("换什么");
    }
    if (question.includes("ROAS") && question.includes("最高")) {
      return preset.question.includes("ROAS 最高");
    }
    if (question.includes("痛点解决")) return preset.question.includes("痛点解决");
    if (question.includes("好奇")) return preset.question.includes("好奇");
    return false;
  });
}

const FALLBACK_ANSWER =
  "我可以从「推销手法表现」「手法×渠道匹配」「渠道选择」几个角度帮你分析。你可以问得更具体，比如「这条视频该换什么推销手法」或「哪种推销手法 ROAS 最高」。";

export interface AssistantReply {
  text: string;
  chips: string[];
}

/** Resolve the assistant reply for a question, falling back to a generic prompt. */
export function resolveAssistantReply(
  presets: DashboardAssistantPreset[],
  question: string,
): AssistantReply {
  const preset = matchPreset(presets, question);
  if (preset) return { text: preset.answer, chips: preset.chips };
  return { text: FALLBACK_ANSWER, chips: presets.map((preset) => preset.question).slice(0, 3) };
}
