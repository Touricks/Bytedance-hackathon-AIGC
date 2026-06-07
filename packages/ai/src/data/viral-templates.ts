import type { ProductBriefArtifact } from "@aigc-video/shared";

export interface ViralTemplateShotStructure {
  purpose: "hook" | "benefit" | "proof" | "cta";
  description: string;
  durationSec: number;
}

export interface ViralTemplate {
  id: string;
  name: string;
  categories: string[];
  angleTypes: string[];
  hookTechnique: string;
  structure: ViralTemplateShotStructure[];
  emotionalArc: string;
  copyStyle: string;
}

// 7 个叙事角度模板。每个模板定义叙事方向和情绪弧线，
// 具体台词由 AI 根据商品特点自由发挥——模板是方向，不是脚本。
// 参考案例来自真实高播放抖音视频（Case A~E）和英文 UGC 参考视频（387.MP4）。
export const VIRAL_TEMPLATES: ViralTemplate[] = [
  {
    id: "curiosity-hook",
    name: "好奇钩子",
    categories: [],
    angleTypes: ["curiosity_hook"],
    hookTechnique:
      "开场说一句反转判断或悬念结论，故意不解释原因，让人停下来想「这什么意思」。" +
      "参考 Case E（包袋）：开场说「能退可以退了」——负面反转，后面才揭秘有多好。" +
      "参考 Case D（护肤）：「618别的都可以不买」——强排除式判断，制造信息稀缺感。" +
      "关键：钩子越反常识、越具体，停留率越高；不要用模糊的「这个真的太好了」。",
    structure: [
      {
        purpose: "hook",
        description:
          "一句反转或悬念句，不解释原因。商品以「揭晓」方式出现：手举起的瞬间 / 侧光刚打亮的一刻，不是已摆好等你看。",
        durationSec: 4,
      },
      {
        purpose: "proof",
        description:
          "用产品操作展示回答钩子的悬念——揭秘过程就是证明过程。镜头聚焦商品本身，优先极近距离材质特写或功能演示。",
        durationSec: 7,
      },
      {
        purpose: "cta",
        description:
          "一句感叹或疑问点明答案，留余韵不催购。参考：「这也太值了吧」「反正我已经是第二个了」。",
        durationSec: 4,
      },
    ],
    emotionalArc: "好奇/疑惑 → 揭秘惊喜 → 会心一笑 → 自然想要",
    copyStyle:
      "悬念开场，结尾点明但不过解释；语速快，信息密度高；全程第一人称口语，像在给朋友说一个发现。",
  },
  {
    id: "problem-solution",
    name: "痛点解决",
    categories: [],
    angleTypes: ["problem_solution"],
    hookTechnique:
      "直接演示目标人群最熟悉的糟糕时刻，不问「你是否有这个问题」，而是把痛点场景搬上画面。" +
      "关键：越具体越有共鸣——不是「背包不够用」，是「手机钱包口红充电宝全要外挂」；" +
      "不是「皮肤不好」，是「涂了三层防晒一出门还是晒黑」。",
    structure: [
      {
        purpose: "hook",
        description:
          "把目标人群的日常痛苦时刻搬上画面，越具体越好。旁白可以是自嘲感叹，不要问「你是否有这种情况」。",
        durationSec: 4,
      },
      {
        purpose: "proof",
        description:
          "产品出现，精准消除痛点——展示操作过程，痛点消失的那一刻要可见。口播轻描淡写「就这样搞定了」，不大喊「彻底解决」。",
        durationSec: 7,
      },
      {
        purpose: "cta",
        description:
          "展示解决后的轻松/满足状态，一句感叹收尾。让人感受到「有了这个我也可以这样」，不催购。",
        durationSec: 4,
      },
    ],
    emotionalArc: "共鸣痛苦 → 解脱感 → 「就是这个」满足感",
    copyStyle:
      "第一人称，代入感强，痛点具体；解决过程轻描淡写，避免「完美解决」等夸张词；像朋友描述自己的发现。",
  },
  {
    id: "before-after",
    name: "前后对比",
    categories: [],
    angleTypes: ["before_after"],
    hookTechnique:
      "开场展示「之前」的不理想状态，让人产生共鸣；之前状态越真实，对比冲击力越大。" +
      "参考 387 视频（家居画作）：前 7 秒展示空白墙壁，背景大面积留空传递「这里少了什么」的感觉，" +
      "不用旁白解释，让负空间本身成为钩子。",
    structure: [
      {
        purpose: "hook",
        description:
          "展示没有使用产品时的真实状态，不夸张，让人有共鸣。旁白「以前一直这样」，或直接展示不说话。",
        durationSec: 4,
      },
      {
        purpose: "proof",
        description:
          "产品登场，展示对比过程——两个状态切换清晰，差异越大越好。口播强调对比的关键维度，不列功能清单。",
        durationSec: 7,
      },
      {
        purpose: "cta",
        description:
          "停在「之后」的理想状态画面，一句感受总结。参考：「现在每次出门都这样了」「回不去了」。不催购。",
        durationSec: 4,
      },
    ],
    emotionalArc: "共鸣现状 → 惊喜变化 → 向往理想状态",
    copyStyle:
      "对比词具体（「之前/现在」「用前/用后」），变化要可见不能只靠口播；语气平静真实，不夸张。",
  },
  {
    id: "review-comparison",
    name: "测评对比",
    categories: [],
    angleTypes: ["review_comparison"],
    hookTechnique:
      "以「买了N个同类/试遍市面」的测评者身份开场，或直接提出测评标准，让观众感受到这是有依据的推荐。" +
      "参考 Case A（水杯）：「你说怕水杯不能装开水冰水」——直接说出用户最大疑虑，同时画面里已经在做验证动作；" +
      "让观众感受到「他是真的在测，不是在演」。",
    structure: [
      {
        purpose: "hook",
        description:
          "建立测评者身份或提出核心测评维度。画面同步：拿着产品做验证动作开场，边说边测，让观众感受到真实性。",
        durationSec: 4,
      },
      {
        purpose: "proof",
        description:
          "用可见动作/数据/对比呈现测评结果——每个维度用画面说话，口播只补充数字或结论。优先极近距离特写展示细节。",
        durationSec: 7,
      },
      {
        purpose: "cta",
        description:
          "明确结论，简短有力。参考：「买这个就行」「这个赢了」「其他的可以退了」。或无旁白，让测评结果自然收尾。",
        durationSec: 4,
      },
    ],
    emotionalArc: "建立信任 → 理性见证 → 确信推荐",
    copyStyle:
      "数字说话，客观语气，结论明确不含糊；允许说出小缺点增加可信度；像专业用户评测，不是广告。",
  },
  {
    id: "tutorial-value",
    name: "教程价值",
    categories: [],
    angleTypes: ["tutorial_value"],
    hookTechnique:
      "先展示令人意外的最终结果或冷知识用法，制造「原来还能这样」的惊喜，再退回来教步骤——结果先行比步骤先行更抓人。" +
      "参考 387 视频原则：先让人看到「这个效果怎么做到的」，再展示过程；" +
      "比直接从步骤一开始更能让人停留。",
    structure: [
      {
        purpose: "hook",
        description:
          "先秀出意外结果或用法，让人想看教程。旁白「你知道这个可以这样用吗」，或直接无旁白演示结果。",
        durationSec: 4,
      },
      {
        purpose: "proof",
        description:
          "手把手步骤演示，每步清晰可复制。双手操作为主，口播标注关键步骤「这一步很重要」，让人感觉跟着能学会。",
        durationSec: 7,
      },
      {
        purpose: "cta",
        description:
          "展示完成效果，鼓励尝试。参考：「就这么简单」「试一下你就知道了」。画面干净利落。",
        durationSec: 4,
      },
    ],
    emotionalArc: "好奇/想学 → 有收获感 → 想立刻尝试",
    copyStyle:
      "步骤清晰，关键词突出；有教学感但不啰嗦，每步一句话；语速可以稍快，信息密度高。",
  },
  {
    id: "authority-proof",
    name: "权威证明",
    categories: [],
    angleTypes: ["authority_proof"],
    hookTechnique:
      "用一句极有分量的结论性判断开场——来自回购者/深度用户/成分党视角，让人感觉这是内行人说的话，不是广告。" +
      "参考 Case D（护肤）：博主直视镜头，手举产品，说「618别的都可以不买」，语气毫不犹豫——" +
      "这种「内行秘密」感让人觉得信息是真实的，不是被安排好的。",
    structure: [
      {
        purpose: "hook",
        description:
          "一句笃定的权威判断，语气毫不犹豫。画面：直视镜头或手举产品，背景简洁。让人感觉在听内行人说话。",
        durationSec: 4,
      },
      {
        purpose: "proof",
        description:
          "用可见证据支撑判断——画面先开口，口播做补充。参考 Case D：使用过程 → 纸巾轻拍效果 → 翻转看成分表。证据停留足够时间，不要一晃而过。",
        durationSec: 7,
      },
      {
        purpose: "cta",
        description:
          "强势收尾，信息感强，不催购。参考 Case D：「反正就这一个」。或「懂的人不用解释」「你看成分就知道了」。",
        durationSec: 4,
      },
    ],
    emotionalArc: "权威震慑 → 证据信服 → 「跟着走」冲动",
    copyStyle:
      "笃定直接，有信息密度，像把内行秘密说出来；允许说具体数字（「用了三年」「回购四次」）；避免模糊表达。",
  },
  {
    id: "emotional-story",
    name: "情感故事",
    categories: [],
    angleTypes: ["emotional_story"],
    hookTechnique:
      "从一个真实的日常情感时刻切入——不是「产品怎么好」，而是「我当时遇到了什么」，产品只是故事的一部分。" +
      "参考 Case B（饼干）：「本来是给儿子买的这个蔬菜小饼干」——" +
      "从家庭场景切入，商品出现在故事里而非广告里，情感共鸣才是真正的钩子。" +
      "参考 Case C（床品）：无旁白开场，脚丫踩上床面，用画面本身触发情感联想。",
    structure: [
      {
        purpose: "hook",
        description:
          "从真实情感场景切入，不是广告感开场。产品可以不在第一帧出现，先建立情感共鸣。参考：「本来是给儿子买的」「那天出门被人夸了三次包」。",
        durationSec: 4,
      },
      {
        purpose: "proof",
        description:
          "产品自然出现在故事里，情感+功能同时展示。不是「这个产品有X功能」，而是「用了之后，那种感觉就来了」——功能通过故事结果体现。",
        durationSec: 7,
      },
      {
        purpose: "cta",
        description:
          "情感收尾，感触点到为止，绝对不催购。参考 Case B：「谁懂啊，抢孩子零食的妈妈」。或「说不清楚，用了就知道」「就是这种感觉」。",
        durationSec: 4,
      },
    ],
    emotionalArc: "情感共鸣 → 自然信任 → 余韵想要",
    copyStyle:
      "像朋友分享真实经历，第一人称叙事；产品不是主角而是故事工具；结尾留白不催购，语气温和克制，允许轻微自嘲。",
  },
  {
    id: "beauty-pain-transform",
    name: "美妆/护肤 · 痛点蜕变型",
    categories: ["护肤品", "彩妆", "美容仪器", "美妆", "护肤"],
    angleTypes: ["problem_solution", "before_after"],
    hookTechnique: "年龄/皮肤焦虑开场，制造危机感",
    structure: [
      { purpose: "hook", description: "展示皮肤痛点场景（暗沉/细纹/痘痘），直接说出目标人群的困境", durationSec: 2 },
      { purpose: "benefit", description: "产品使用过程特写，强调质地/气味/上脸感受", durationSec: 3 },
      { purpose: "benefit", description: "7天/30天效果对比，画面切换前后", durationSec: 3 },
      { purpose: "proof", description: "真实素人反馈或成分权威背书", durationSec: 2 },
      { purpose: "proof", description: "具体数字（98%用户/皮肤科认证/XX万人在用）", durationSec: 1 },
      { purpose: "cta", description: "限时价格+催促（今天下单立减/名额有限）", durationSec: 1 },
    ],
    emotionalArc: "焦虑 → 好奇 → 惊喜 → 信任 → 行动冲动",
    copyStyle: "口语化自述，第一人称，避免广告腔",
  },
  {
    id: "tech-scene-pain",
    name: "3C/数码 · 场景痛点型",
    categories: ["耳机", "手机配件", "小家电", "智能设备", "数码", "3C", "电子"],
    angleTypes: ["problem_solution"],
    hookTechnique: "展示没有这个产品时的尴尬场景",
    structure: [
      { purpose: "hook", description: "没有此产品的痛苦场景（地铁噪音/充电焦虑/信号差）", durationSec: 2 },
      { purpose: "benefit", description: "产品解决问题的瞬间，强调使用感受", durationSec: 3 },
      { purpose: "benefit", description: "核心功能演示，用数据说话（降噪40dB/续航72小时）", durationSec: 3 },
      { purpose: "proof", description: "与竞品对比或专业测评截图", durationSec: 2 },
      { purpose: "proof", description: "真实使用场景，用户好评语录", durationSec: 1 },
      { purpose: "cta", description: "价格锚定（原价XX，现在只要XX）+行动引导", durationSec: 1 },
    ],
    emotionalArc: "共鸣痛点 → 解脱感 → 理性认可 → 价值确认 → 下单",
    copyStyle: "直接、干脆，多用数字和对比",
  },
  {
    id: "food-appetite-shock",
    name: "食品/零食 · 食欲冲击型",
    categories: ["零食", "饮品", "预制食品", "特产", "食品", "餐饮"],
    angleTypes: ["lifestyle_upgrade", "trust_proof"],
    hookTechnique: "用「money shot」开场：拉丝/冒热气/截面/酱汁坠落/手掰开的瞬间——无需旁白，画面本身就是钩子",
    structure: [
      { purpose: "hook", description: "产品最有感官冲击力的动态画面极近特写：拉丝瞬间/热气升腾/截面纹理/酱汁淋下/手掰开的断面——画面填满，无旁白", durationSec: 2 },
      { purpose: "benefit", description: "食材/用料的新鲜感特写：水珠在食材表面、切开的饱满截面、倒入锅里的天然原料——让观众感知用料品质，旁白轻描食材亮点", durationSec: 3 },
      { purpose: "benefit", description: "第一口入镜的真实反应：手拿/夹起食物、送入口中、咀嚼时真实表情（不夸张）——重点是食物入镜时的质感，旁白描述口感触感", durationSec: 3 },
      { purpose: "proof", description: "产地/工艺的可视化细节：产地实景/手工制作过程/新鲜日期近景——用画面建立品质信任，不用销量数字", durationSec: 2 },
      { purpose: "proof", description: "包装/配料表/认证标志近景特写，或复购/分享的真实场景——细节建立信任", durationSec: 1 },
      { purpose: "cta", description: "食物在自然场景中的满足感收尾（早餐桌/下午茶/宵夜氛围），余韵感强，不制造稀缺焦虑", durationSec: 1 },
    ],
    emotionalArc: "食欲瞬间激发 → 食材好奇/品质感知 → 口感代入 → 品质信任 → 自然想拥有",
    copyStyle: "感官词驱动：写质地（酥/脆/绵/糯/流心）、温度（滚烫/冰凉/温热）、声音联觉（听得见的酥脆感）；旁白轻，留白给画面；禁止「好吃到爆」「人间美味」等空洞感叹词",
  },
  {
    id: "fashion-lifestyle-upgrade",
    name: "服装/穿搭 · 生活升级型",
    categories: ["服装", "鞋包", "饰品", "穿搭", "包", "鞋子", "配饰"],
    angleTypes: ["lifestyle_upgrade", "before_after"],
    hookTechnique: "用松弛感强的日常场景开场，商品自然出现，不制造「变了一个人」的紧张感",
    structure: [
      { purpose: "hook", description: "真实生活片段，商品随手出现在画面，氛围感驱动停留（不是痛点）", durationSec: 2 },
      { purpose: "benefit", description: "人在日常场景中自然使用/佩戴产品，画面松弛不刻意，像朋友随手拍", durationSec: 3 },
      { purpose: "benefit", description: "产品细节特写，强调质感和做工，voiceover 轻描淡写「就是那种感觉」", durationSec: 3 },
      { purpose: "proof", description: "不同场合/搭配下的真实上身/使用效果，强调自然好看而非变身", durationSec: 2 },
      { purpose: "proof", description: "材质/工艺细节或真实用户反馈，建立品质信任", durationSec: 1 },
      { purpose: "cta", description: "侧身背包或手持包自然收尾，旁白留白或一句感叹（「就是它了」「背上就是那个感觉」），绝对不出现「去看看」「链接挂主页」等催购词", durationSec: 1 },
    ],
    emotionalArc: "氛围吸引 → 自然好感 → 品质认可 → 不费力的满足感 → 轻松下单",
    copyStyle: "松弛随意，留白多，像真实用户分享而非广告，不说「变了一个人」",
  },
  {
    id: "bag-physical-verify",
    name: "包袋/皮具 · 多维物理验证型",
    categories: ["包", "包袋", "皮包", "手提包", "单肩包", "斜挎包", "双肩包", "皮具", "箱包", "钱包", "背包"],
    angleTypes: ["trust_proof", "lifestyle_upgrade"],
    hookTechnique: "反转钩子——开场说负面（「能退可以退了」「我本来不抱期待」），制造认知反差，让观众想看后续",
    structure: [
      { purpose: "hook", description: "手举包让它自然垂落或单手掂包，旁白用反转句式（「能退可以退了」「我本来没想买第二个」），室内侧光让皮面光泽入镜", durationSec: 4 },
      { purpose: "proof", description: "【前3秒】手指甲在皮面缓慢刮划，再整掌揉捏包体，皮料凹陷后快速回弹，特写皮面纹理——证明质感；【后4秒】两手撑开包口向镜头展示内部空间，侧光透入包内，展示容量——证明功能", durationSec: 7 },
      { purpose: "cta", description: "博主侧身背包自然转身，展示包与身型的贴合感；旁白用情绪感叹收尾（「这也太值了吧」「反正我已经用烂了第一个」），绝对不出现任何催购词", durationSec: 4 },
    ],
    emotionalArc: "反差好奇 → 亲眼见证质感与容量 → 上身效果确认 → 自然想要",
    copyStyle: "反转式开场，第一人称，proof 用「捏一下就知道」「不像这个价格的包」等感官+判断词，cta 用情绪感叹而非推销",
  },
  {
    id: "home-lazy-essentials",
    name: "家居/生活用品 · 懒人刚需型",
    categories: ["收纳", "清洁", "厨房用品", "家装", "家居", "生活用品"],
    angleTypes: ["problem_solution", "before_after"],
    hookTechnique: "展示家里乱/脏/不便的真实痛苦场面",
    structure: [
      { purpose: "hook", description: "没有此产品时的混乱/麻烦/费时场景", durationSec: 2 },
      { purpose: "benefit", description: "产品使用过程，强调省力/省时/好用", durationSec: 3 },
      { purpose: "benefit", description: "使用前后对比（乱→整齐/脏→干净）", durationSec: 3 },
      { purpose: "proof", description: "具体节省时间/空间数据", durationSec: 2 },
      { purpose: "proof", description: "家人/朋友的反应，真实互动", durationSec: 1 },
      { purpose: "cta", description: "组合装/套装优惠+下单引导", durationSec: 1 },
    ],
    emotionalArc: "共鸣麻烦 → 解脱轻松 → 效果惊喜 → 实用认可 → 下单",
    copyStyle: "接地气，说大白话，强调「真的好用」",
  },
  {
    id: "sport-self-discipline",
    name: "运动/健康 · 自律激励型",
    categories: ["运动器材", "保健品", "健身装备", "运动", "健康", "健身"],
    angleTypes: ["problem_solution", "lifestyle_upgrade"],
    hookTechnique: "用「你是不是也…」直接点名目标人群的懈怠感",
    structure: [
      { purpose: "hook", description: "点名懒惰/亚健康的生活状态，引发自我代入", durationSec: 2 },
      { purpose: "benefit", description: "产品如何降低运动门槛/让健康更简单", durationSec: 3 },
      { purpose: "benefit", description: "坚持使用的正向变化（体重/状态/精力）", durationSec: 3 },
      { purpose: "proof", description: "用户打卡记录或真实成果截图", durationSec: 2 },
      { purpose: "proof", description: "专家/KOL背书或科学数据", durationSec: 1 },
      { purpose: "cta", description: "限时优惠+今天就开始的行动召唤", durationSec: 1 },
    ],
    emotionalArc: "自我审视 → 希望燃起 → 信任建立 → 决心激发 → 下单",
    copyStyle: "励志但不鸡汤，真实感强，有同理心",
  },
  {
    id: "baby-safety-care",
    name: "母婴 · 安心守护型",
    categories: ["婴儿用品", "儿童食品", "母婴护肤", "母婴", "儿童"],
    angleTypes: ["trust_proof"],
    hookTechnique: "用孩子/宝宝的可爱或安全焦虑开场",
    structure: [
      { purpose: "hook", description: "展示孩子的需求或妈妈的担忧（安全/成长/健康）", durationSec: 2 },
      { purpose: "benefit", description: "产品安全认证/成分天然特写", durationSec: 3 },
      { purpose: "benefit", description: "宝宝实际使用场景，真实反应", durationSec: 3 },
      { purpose: "proof", description: "权威认证/医生推荐/检测报告", durationSec: 2 },
      { purpose: "proof", description: "妈妈群真实好评，情感共鸣", durationSec: 1 },
      { purpose: "cta", description: "买给孩子最好的+下单引导", durationSec: 1 },
    ],
    emotionalArc: "共情担忧 → 安心感 → 信任建立 → 母爱认同 → 下单",
    copyStyle: "温暖、安心、有情感，站在妈妈的视角说话",
  },
  {
    id: "daily-goods-function-verify",
    name: "日用品/家居 · 功能验证型",
    categories: ["水杯", "杯子", "保温杯", "日用品", "厨具", "家居用品", "收纳"],
    angleTypes: ["trust_proof", "problem_solution"],
    hookTechnique: "用反常识句式点出用户的疑虑，然后当场做验证动作打消顾虑",
    structure: [
      { purpose: "hook", description: "一句话说出用户最大的顾虑，同时画面里已经在做验证动作（倒水/压测/摔落）", durationSec: 3 },
      { purpose: "proof", description: "放大展示验证结果：杯身无变形、无渗水、回弹；手指触摸质感细节", durationSec: 5 },
      { purpose: "proof", description: "从侧面/底部/开口多角度展示产品工艺，口播用数字说话（双层/316钢/耐温200°）", durationSec: 3 },
      { purpose: "cta", description: "把产品放在日常场景里（桌面/包里/手边），镜头停留，无催促", durationSec: 4 },
    ],
    emotionalArc: "疑虑共鸣 → 亲眼见证 → 细节信任 → 自然想要",
    copyStyle: "直接、口语，像做实验给朋友看，不夸张，数字说话",
  },
  {
    id: "food-discovery-share",
    name: "零食/食品 · 发现分享型",
    categories: ["零食", "水果", "食品", "特产", "小吃", "坚果", "饮品"],
    angleTypes: ["lifestyle_upgrade", "trust_proof"],
    hookTechnique: "以「我发现了一个...」「本来是给XX买的结果自己上瘾了」开场，用发现者或意外上瘾的身份拉近距离",
    structure: [
      { purpose: "hook", description: "手托/手抓产品放满画面，第一人称说出「发现」或「意外上瘾」的转折，画面饱满有食欲感", durationSec: 3 },
      { purpose: "proof", description: "近距离展示产品颜色/颗粒/截面，手抓取放入口中，真实咀嚼反应（不夸张）", durationSec: 5 },
      { purpose: "proof", description: "展示包装/克重/产地细节，或与家人分享的自然场景", durationSec: 3 },
      { purpose: "cta", description: "一句话收尾，带共鸣感（「谁懂啊」「你试一下就知道了」「反正我已经囤了三箱」）", durationSec: 4 },
    ],
    emotionalArc: "好奇被勾起 → 食欲代入 → 品质认可 → 共鸣想拥有",
    copyStyle: "发现者口吻，第一人称，轻松真实，用共鸣收尾而非推销",
  },
  {
    id: "home-textile-visual-immersion",
    name: "家居/床品 · 视觉沉浸型",
    categories: ["床品", "寝具", "毛巾", "浴巾", "被子", "枕头", "家纺", "床笠"],
    angleTypes: ["lifestyle_upgrade"],
    hookTechnique: "不用语言开场，用极致质感画面+轻声自言自语吸引注意；让观众先被画面打动再听内容",
    structure: [
      { purpose: "hook", description: "特写面料质感（俯拍/侧光），身体局部（手/脚丫/脸颊）与产品接触，仅一句轻柔旁白或完全无旁白", durationSec: 3 },
      { purpose: "proof", description: "手掌平推/揉捏/轻抖，侧光展示面料纹理，口播描述触感（棉感/弹性/垂感）", durationSec: 5 },
      { purpose: "proof", description: "展示洗后状态或使用场景全貌，色彩呈现真实自然", durationSec: 3 },
      { purpose: "cta", description: "轻柔无旁白结尾，或一句「摸过你就懂了」，让质感说话", durationSec: 4 },
    ],
    emotionalArc: "视觉触动 → 触感代入 → 品质认可 → 居家向往",
    copyStyle: "轻柔低语，几乎不说功能，靠感官词（绵/软/垂/滑/弹）传达一切",
  },
  {
    id: "beauty-bold-opinion",
    name: "美妆/护肤 · 强观点背书型",
    categories: ["护肤品", "喷雾", "精华", "面霜", "防晒", "美妆", "护肤"],
    angleTypes: ["trust_proof", "lifestyle_upgrade"],
    hookTechnique: "用一句极强的结论性判断开场（「618别的都可以不买」「用了三年没换过」），制造权威感和稀缺信息感",
    structure: [
      { purpose: "hook", description: "博主直视镜头，手指指向观众或举起产品，说出强观点/强结论，语气笃定不犹豫", durationSec: 3 },
      { purpose: "proof", description: "演示使用步骤，展示产品质地（喷雾/膏体），对着皮肤使用后的即时效果", durationSec: 4 },
      { purpose: "proof", description: "翻转产品展示成分表/认证，或拿出使用记录（空瓶/回购记录截图）", durationSec: 4 },
      { purpose: "cta", description: "一句话强收尾，传递「只有我告诉你」的信息感（「反正就这一个」「你懂的」）", durationSec: 4 },
    ],
    emotionalArc: "强观点震住 → 好奇验证 → 成分/数据信服 → 「跟着博主走」冲动",
    copyStyle: "笃定直接，像把业内秘密说出来，第一人称，避免模糊表达",
  },
  {
    id: "haircare-result-first",
    name: "美发/个人护理 · 结果先行型",
    categories: ["卷发棒", "吹风机", "发梳", "护发素", "洗发水", "美发工具", "头发护理", "个人护理"],
    angleTypes: ["before_after", "lifestyle_upgrade"],
    hookTechnique: "先展示发型/肤感的理想结果，再揭晓是哪个工具/产品做到的——让结果成为钩子，不从痛点开场",
    structure: [
      { purpose: "hook", description: "发型/发质的最佳状态大特写（卷度饱满/顺滑发丝/光泽感），博主甩发或手抚发丝，标题或旁白直接点出「怎么做到的」悬念", durationSec: 3 },
      { purpose: "benefit", description: "展示产品使用过程：上手操作步骤（夹发/绕发/刷涂），动作流畅不复杂，口播强调「睡前两分钟」「随手就能搞定」等低门槛感", durationSec: 4 },
      { purpose: "proof", description: "使用前后对比或时间延迟展示（「睡前夹上，早上拆开就是这个」），强调持久性和不伤发", durationSec: 4 },
      { purpose: "cta", description: "对镜甩发或手撩发丝，无旁白或一句「你也可以」，让结果画面自然收尾", durationSec: 4 },
    ],
    emotionalArc: "结果羡慕 → 原来这么简单 → 低门槛信任 → 想复制同款",
    copyStyle: "轻松随意，像分享生活技巧，强调「简单/随手/不费力」，避免专业术语",
  },
  {
    id: "home-decor-lifestyle-resonance",
    name: "家居装饰/厨房小物 · 生活氛围共鸣型",
    categories: ["厨房用品", "家居装饰", "收纳好物", "桌面摆件", "家居小物", "卫浴用品", "生活杂货"],
    angleTypes: ["lifestyle_upgrade"],
    hookTechnique: "用「哈哈哈谁懂啊」「就是那种感觉」这类共鸣型自嘲开场，把买它的理由归结为「就是好看/就是喜欢」而非功能",
    structure: [
      { purpose: "hook", description: "产品在真实居家环境里的氛围感画面（厨台/桌面/窗台），旁白一句共鸣式自嘲或感叹（「哈哈哈谁懂啊」「就是忍不住」），不解释功能", durationSec: 3 },
      { purpose: "benefit", description: "360°展示产品颜值细节：材质光泽、配色、局部工艺特写，自然融入真实生活场景，展示「放在家里就是好看」", durationSec: 5 },
      { purpose: "proof", description: "演示日常使用的顺手感（抽纸/收纳/摆放），顺带提一句实用之处，但语气轻描淡写，不做功能推销", durationSec: 3 },
      { purpose: "cta", description: "把产品留在画面中心，镜头缓缓拉远，让整体居家氛围收尾；旁白可为空或一句「反正我很满意」", durationSec: 4 },
    ],
    emotionalArc: "共鸣会心一笑 → 被颜值打动 → 想象放在自己家 → 自然下单",
    copyStyle: "随性口语，带点自嘲和幽默，不严肃，像朋友安利一个「没什么用但就是好看」的东西",
  },
  {
    id: "fresh-produce-sensory-discovery",
    name: "生鲜/水果 · 鲜度感官型",
    categories: ["水果", "生鲜", "蔬菜", "海鲜", "肉类", "鲜花", "有机食品"],
    angleTypes: ["lifestyle_upgrade", "trust_proof"],
    hookTechnique: "用产品本身的颜色/水分/光泽开场，第一帧就要有「这个真的很新鲜/很好看」的视觉冲击，不靠旁白，靠画面抓人",
    structure: [
      { purpose: "hook", description: "产品特写占满画面：饱满色泽、表面水珠、新鲜截面——画面本身就是钩子；旁白可以是「我发现了一个...」或完全无旁白", durationSec: 3 },
      { purpose: "proof", description: "手持/掰开/切开产品，展示内部色泽和水分；直接咬一口或品尝，真实表情反应（不夸张），口播描述口感", durationSec: 5 },
      { purpose: "proof", description: "展示产地/包装/克重，或快递到家开箱的新鲜状态，建立「这个真的新鲜」的信任感", durationSec: 3 },
      { purpose: "cta", description: "水果/食材在自然光下的静物感画面收尾，一句「今年吃到最好吃的」或无旁白留余韵", durationSec: 4 },
    ],
    emotionalArc: "视觉食欲 → 新鲜感代入 → 口感信任 → 想立刻买到",
    copyStyle: "感官词驱动（脆/甜/多汁/香/鲜），第一人称发现者口吻，语气轻松不浮夸",
  },
  {
    id: "pet-supplies-cuteness-trust",
    name: "宠物用品 · 萌宠信任型",
    categories: ["猫粮", "狗粮", "宠物零食", "宠物玩具", "宠物用品", "猫咪用品", "狗狗用品"],
    angleTypes: ["trust_proof", "lifestyle_upgrade"],
    hookTechnique: "让宠物本身成为主角出现在第一帧，用宠物的行为反应（扑过来/疯狂嗅/秒吃光）代替人工口播做背书",
    structure: [
      { purpose: "hook", description: "猫/狗看到产品或食物时的真实反应特写（竖耳朵/扑过去/盯着看），旁白轻描一句宠物的状态，让宠物行为说话", durationSec: 3 },
      { purpose: "proof", description: "宠物实际使用/进食的全程：嗅闻、咬开、吃掉，记录真实反应；口播描述成分/口味/适合场景", durationSec: 5 },
      { purpose: "proof", description: "展示产品包装/成分表/规格，或宠物使用后的满足状态（趴着/打呼/安静玩耍）", durationSec: 3 },
      { purpose: "cta", description: "宠物与产品同框的温馨画面收尾，一句「它现在每天都要」或无旁白让画面说话", durationSec: 4 },
    ],
    emotionalArc: "宠物萌态吸引 → 真实反应建立信任 → 成分/品质认可 → 为毛孩子下单",
    copyStyle: "宠物视角口吻，充满宠爱，口语化，多描述宠物的反应而非产品参数",
  },
];

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[\s/·,，。、]+/)
    .filter(Boolean);
}

function scoreTemplate(template: ViralTemplate, brief: Pick<ProductBriefArtifact, "product">): number {
  let score = 0;
  const categoryTokens = tokenize(brief.product.category);

  for (const cat of template.categories) {
    const catTokens = tokenize(cat);
    for (const token of categoryTokens) {
      if (catTokens.some((t) => t.includes(token) || token.includes(t))) {
        score += 3;
        break;
      }
    }
  }

  const nameMatch = tokenize(template.name).some((t) =>
    categoryTokens.some((ct) => ct.includes(t) || t.includes(ct)),
  );
  if (nameMatch) score += 1;

  return score;
}

export function searchTemplates(
  brief: Pick<ProductBriefArtifact, "product">,
  topK = 3,
  scriptAngle?: string,
): ViralTemplate[] {
  if (scriptAngle) {
    const matched = VIRAL_TEMPLATES.filter((t) =>
      t.angleTypes.includes(scriptAngle),
    );
    if (matched.length > 0) return matched.slice(0, topK);
  }

  const scored = VIRAL_TEMPLATES.map((t) => ({
    template: t,
    score: scoreTemplate(t, brief),
  })).sort((a, b) => b.score - a.score);

  const top = scored.slice(0, topK);
  if (top.length === 0 || top[0]!.score === 0) {
    return VIRAL_TEMPLATES.slice(0, topK);
  }
  return top.map((s) => s.template);
}
