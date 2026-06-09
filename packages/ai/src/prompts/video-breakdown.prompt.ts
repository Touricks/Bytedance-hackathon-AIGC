export const VIDEO_BREAKDOWN_PROMPT_VERSION = "video-breakdown.v1";

export interface VideoBreakdownInput {
  videoTitle: string;
  description: string;
  platform?: string;
  productCategory?: string;
}

export function buildVideoBreakdownPrompt(input: VideoBreakdownInput): string {
  return [
    "角色：",
    "你是电商爆款视频分析专家。给你一段视频描述，你要拆解出它的爆款逻辑，输出结构化拆解报告。",
    "",
    "## 视频信息",
    `视频标题：${input.videoTitle}`,
    input.platform ? `发布平台：${input.platform}` : "",
    input.productCategory ? `商品品类：${input.productCategory}` : "",
    "",
    "## 视频描述",
    input.description,
    "",
    "## 拆解任务",
    "",
    "请从以下维度拆解这个视频，输出结构化 JSON：",
    "",
    "1. hookTechnique：开场 Hook 手法（1-2句，具体说明用了什么制造停留感的手段，如「年龄焦虑对比」「反差冲突」「悬念提问」「极致食欲画面」）",
    "",
    "2. sellingPoints：提炼出视频传递的核心卖点列表（2-4个字符串，每个 ≤15字）",
    "",
    "3. structure：按时间顺序拆解分镜，每个 shot 包含：",
    "   - purpose：hook / benefit / proof / cta 之一",
    "   - description：这段画面/旁白在做什么（≤30字）",
    "   - durationSec：估算时长（整数秒）",
    "",
    "4. emotionalArc：用「A → B → C → D → E」格式描述情绪走向（≤50字）",
    "",
    "5. copyStyle：旁白风格描述（≤20字，如「口语化自述，第一人称」）",
    "",
    "6. suggestedCategories：这套模板适合哪些品类（2-5个字符串，每个 ≤8字）",
    "",
    "7. suggestedName：为这套爆款套路起一个名字（格式：「品类 · 套路类型」，如「服装 · 生活升级型」）",
    "",
    "8. whyViral：用一句话说明这个视频爆款的核心原因（≤40字）",
    "",
    "输出要求：",
    "- 严格按 JSON Schema 输出，不要包含 Markdown 代码块",
    "- structure 至少 3 个 shot，最多 8 个",
    "- 所有字符串用中文",
  ]
    .filter(Boolean)
    .join("\n");
}
