import type {
  MaterialIntakeArtifact,
  ProductBriefArtifact,
} from "@aigc-video/shared";

export const VIRAL_IMITATION_PROMPT_VERSION = "viral-imitation.v1";

export interface ViralImitationInput {
  brief: ProductBriefArtifact;
  material: MaterialIntakeArtifact;
}

// 爆款模板库：按品类预设，AI 根据 brief 自动选最匹配的一个
const VIRAL_TEMPLATE_LIBRARY = `
## 爆款模板库

### 模板 1：美妆/护肤 · 痛点蜕变型
- 适用品类：护肤品、彩妆、美容仪器
- Hook 技巧：年龄/皮肤焦虑开场，制造危机感
- 结构：
  [hook] 展示皮肤痛点场景（暗沉/细纹/痘痘），直接说出目标人群的困境
  [benefit] 产品使用过程特写，强调质地/气味/上脸感受
  [benefit] 7天/30天效果对比，画面切换前后
  [proof] 真实素人反馈或成分权威背书
  [proof] 具体数字（98%用户/皮肤科认证/XX万人在用）
  [cta] 限时价格+催促（今天下单立减/名额有限）
- 情绪弧线：焦虑 → 好奇 → 惊喜 → 信任 → 行动冲动
- 台词风格：口语化自述，第一人称，避免广告腔

### 模板 2：3C/数码 · 场景痛点型
- 适用品类：耳机、手机配件、小家电、智能设备
- Hook 技巧：展示没有这个产品时的尴尬场景
- 结构：
  [hook] 没有此产品的痛苦场景（地铁噪音/充电焦虑/信号差）
  [benefit] 产品解决问题的瞬间，强调使用感受
  [benefit] 核心功能演示，用数据说话（降噪40dB/续航72小时）
  [proof] 与竞品对比或专业测评截图
  [proof] 真实使用场景，用户好评语录
  [cta] 价格锚定（原价XX，现在只要XX）+行动引导
- 情绪弧线：共鸣痛点 → 解脱感 → 理性认可 → 价值确认 → 下单
- 台词风格：直接、干脆，多用数字和对比

### 模板 3：食品/零食 · 食欲冲击型
- 适用品类：零食、饮品、预制食品、特产
- Hook 技巧：极致食欲画面开场，先勾起欲望再讲故事
- 结构：
  [hook] 产品最诱人的画面（拉丝/冒泡/热气），不说话只看图
  [benefit] 制作/原料场景，强调天然/新鲜/用料足
  [benefit] 吃的过程展示，表情反应，口感描述
  [proof] 产地/配方来源背书，或网红/达人推荐
  [proof] 销量数据（月销XX万/复购率90%）
  [cta] 限量/季节性稀缺感+下单引导
- 情绪弧线：食欲激发 → 好奇产地 → 品质信任 → 稀缺焦虑 → 下单
- 台词风格：感官描述词丰富，多形容词，少说理

### 模板 4：服装/穿搭 · 生活升级型
- 适用品类：服装、鞋包、饰品
- Hook 技巧：展示穿上之后的"变了一个人"的对比
- 结构：
  [hook] 目标人群的日常穿搭困境（显胖/土气/没气质）
  [benefit] 穿上产品后的完整造型展示，多角度
  [benefit] 面料/工艺特写，强调品质感
  [proof] 不同身材/场合的上身效果，真实感
  [proof] 设计师理念或品牌故事，提升格调
  [cta] 颜色/尺码稀缺提示+下单
- 情绪弧线：认同痛点 → 向往效果 → 品质信任 → 认同价值 → 行动
- 台词风格：有品位感，不过度煽情，自然真实

### 模板 5：家居/生活用品 · 懒人刚需型
- 适用品类：收纳、清洁、厨房用品、家装
- Hook 技巧：展示家里乱/脏/不便的真实痛苦场面
- 结构：
  [hook] 没有此产品时的混乱/麻烦/费时场景
  [benefit] 产品使用过程，强调省力/省时/好用
  [benefit] 使用前后对比（乱→整齐/脏→干净）
  [proof] 具体节省时间/空间数据
  [proof] 家人/朋友的反应，真实互动
  [cta] 组合装/套装优惠+下单引导
- 情绪弧线：共鸣麻烦 → 解脱轻松 → 效果惊喜 → 实用认可 → 下单
- 台词风格：接地气，说大白话，强调"真的好用"

### 模板 6：运动/健康 · 自律激励型
- 适用品类：运动器材、保健品、健身装备
- Hook 技巧：用"你是不是也…"直接点名目标人群的懈怠感
- 结构：
  [hook] 点名懒惰/亚健康的生活状态，引发自我代入
  [benefit] 产品如何降低运动门槛/让健康更简单
  [benefit] 坚持使用的正向变化（体重/状态/精力）
  [proof] 用户打卡记录或真实成果截图
  [proof] 专家/KOL背书或科学数据
  [cta] 限时优惠+今天就开始的行动召唤
- 情绪弧线：自我审视 → 希望燃起 → 信任建立 → 决心激发 → 下单
- 台词风格：励志但不鸡汤，真实感强，有同理心

### 模板 7：母婴 · 安心守护型
- 适用品类：婴儿用品、儿童食品、母婴护肤
- Hook 技巧：用孩子/宝宝的可爱或安全焦虑开场
- 结构：
  [hook] 展示孩子的需求或妈妈的担忧（安全/成长/健康）
  [benefit] 产品安全认证/成分天然特写
  [benefit] 宝宝实际使用场景，真实反应
  [proof] 权威认证/医生推荐/检测报告
  [proof] 妈妈群真实好评，情感共鸣
  [cta] 买给孩子最好的+下单引导
- 情绪弧线：共情担忧 → 安心感 → 信任建立 → 母爱认同 → 下单
- 台词风格：温暖、安心、有情感，站在妈妈的视角说话
`;

export function buildViralImitationPrompt(input: ViralImitationInput): string {
  const { brief, material } = input;

  const refs = material.assets
    .filter((a) => a.included)
    .map((a) => a.ref);

  return [
    "角色：",
    "你是电商爆款视频策划专家。你的任务是：根据商品 brief，从爆款模板库中自动选出最匹配的模板，然后按该模板的叙事结构生成一套完整的 UGC 分镜脚本。",
    "",
    "## 商品信息",
    `商品名称：${brief.product.name}`,
    `品类：${brief.product.category}`,
    `核心卖点：${brief.coreSellingPoint}`,
    `目标人群：${brief.audience.who}`,
    `人群痛点/欲望：${brief.audience.painOrDesire}`,
    `情绪触发点：${brief.emotionalTrigger ?? "未指定"}`,
    `转化风格：${brief.conversionStyle ?? "soft_cta"}`,
    `品牌调性：${brief.brandTone}`,
    brief.offer ? `促销信息：${brief.offer}` : "",
    brief.proof.length > 0 ? `背书信息：${brief.proof.join("、")}` : "",
    brief.bannedExpressions.length > 0
      ? `禁用表达：${brief.bannedExpressions.join("、")}`
      : "",
    "",
    "## 可用素材 ref（productAssetRef 只能使用以下值）",
    refs.join("、"),
    "",
    VIRAL_TEMPLATE_LIBRARY,
    "",
    "## 你的任务",
    "",
    "第一步：从模板库中选出最匹配当前商品品类和受众的模板，记录 viralTemplateUsed（模板名称）和 matchReason（选择理由，一句话）。",
    "",
    "第二步：严格按照所选模板的【结构】生成 6 个分镜，每个分镜对应模板中的一段：",
    "- [hook] → purpose: \"hook\"，时长 2s",
    "- 第一个 [benefit] → purpose: \"benefit\"，时长 3s",
    "- 第二个 [benefit] → purpose: \"benefit\"，时长 3s",
    "- 第一个 [proof] → purpose: \"proof\"，时长 2s",
    "- 第二个 [proof] → purpose: \"proof\"，时长 1s",
    "- [cta] → purpose: \"cta\"，时长 1s",
    "",
    "每个分镜字段要求：",
    "- voiceover：≤15 字，真实口语，禁止广告腔，体现所选模板的台词风格",
    "- scene：具体地点+光线，≤20 字",
    "- visualDirection：镜头类型（特写/中景/全景）+ 运动方式",
    "- productAssetRef：从可用素材 ref 中选择最合适的一个",
    "- transition：镜头切换方式（如：直切、淡入、快切）",
    "",
    "第三步：写一句 narrative（整体叙事主线，20-50字），说明这套脚本遵循的爆款逻辑。",
    "",
    "输出要求：",
    "- 严格按 JSON Schema 输出，不要包含 Markdown",
    "- viralTemplateUsed 填模板名称（如：美妆/护肤 · 痛点蜕变型）",
    "- matchReason 一句话说明为什么选这个模板",
    "- 整体情绪弧线必须符合所选模板的情绪走向",
  ]
    .filter(Boolean)
    .join("\n");
}
