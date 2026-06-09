import type {
  MaterialIntakeArtifact,
  ProductBriefArtifact,
  StoryboardArtifact,
} from "@aigc-video/shared";
import type { RuntimePromptView } from "./material-intake.prompt.js";
import { formatCreativeRequirementsForModule } from "./creative-requirements-context.js";
import { buildModulePrompt } from "./module-prompt-assembler.js";

export const SHOTPROMPT_PROMPT_VERSION = "video-shotprompt";

export interface CreativeRequirements {
  image?: Record<string, unknown>;
  script?: Record<string, unknown>;
  storyboard?: Record<string, unknown>;
  shotImage?: Record<string, unknown>;
  shotVideo?: Record<string, unknown>;
  [key: string]: Record<string, unknown> | undefined;
}

export interface BuildShotPromptPromptInput {
  brief: ProductBriefArtifact;
  material: MaterialIntakeArtifact;
  storyboard: StoryboardArtifact;
  aspectRatio: "9:16" | "16:9" | "1:1";
  creativeRequirements?: CreativeRequirements;
}

export interface BuildShotPromptPromptViewInput extends BuildShotPromptPromptInput {
  contractId: string;
  promptVersion: string;
  provider: RuntimePromptView["provider"];
  model?: string;
}

interface CategoryVisualPreset {
  label: string;
  providerPromptStyle: string;
  shotImageStyle: string;
  keywords: RegExp;
}

const CATEGORY_VISUAL_PRESETS: CategoryVisualPreset[] = [
  {
    label: "包袋箱包",
    keywords: /包|箱包|手提包|单肩包|斜挎包|双肩包|腰包|背包|钱包|皮包|帆布包|托特包|水桶包|购物袋/,
    providerPromptStyle:
      "【包袋品类】材质信任风格：侧光或窗边漫射光让皮料/帆布纹理立体可见，高光打亮五金件；hook 优先「手举包/侧光打亮皮面瞬间」而非人站着拿包；proof 优先极近距离皮料纹理特写（5-10cm，看每一颗荔枝纹/十字纹颗粒）+ 包口撑开展示内构；色调暖棕/暖金，禁止冷白棚拍感",
    shotImageStyle:
      "皮具写真，侧光打亮皮料纹理，暖棕金色调，极近距离材质特写清晰，五金光泽感，背景浅焦虚化，非广告棚拍感，UGC质感",
  },
  {
    label: "服装穿搭",
    keywords: /服装|上衣|外套|裤子|连衣裙|卫衣|T恤|衬衫|裙子|羽绒服|毛衣|针织|牛仔|穿搭|服饰/,
    providerPromptStyle:
      "【服装品类】面料质感风格：柔和自然光突出面料悬垂感和纹理；proof 优先面料特写（手触摸/轻拽/折叠）而非穿搭全身图；如需穿搭：人物只能腰以上侧身/背影，移动状态，禁止正面全身站姿；色调跟随商品配色，整体松弛不刻意",
    shotImageStyle:
      "服装写真，自然柔光，面料纹理清晰，悬垂感真实，非模特感，人物侧身或背影局部入镜，整体松弛随性",
  },
  {
    label: "鞋靴",
    keywords: /鞋|靴|运动鞋|板鞋|高跟鞋|凉鞋|拖鞋|皮鞋|帆布鞋|球鞋|老爹鞋/,
    providerPromptStyle:
      "【鞋靴品类】侧面廓形风格：侧光强调鞋底厚度和轮廓线条，鞋面材质近景（皮革/网布/胶底）；如有穿搭：只拍脚踝以下，走动中的自然晃动；禁止「鞋放在地上拍」的广告棚模式",
    shotImageStyle:
      "鞋靴写真，侧光廓形感，鞋面材质特写，脚踝以下局部穿搭，行走动态，非棚拍感",
  },
  {
    label: "食品零食",
    keywords: /食品|零食|饮品|餐饮|食物|美食|茶|咖啡|烘焙|糖果|坚果|乳制|调味|速食|特产|预制|小吃|糕点/,
    providerPromptStyle:
      "【食品品类】感官冲击风格：暖橙金色调高饱和，侧逆光让食材纹理发光通透；hook 优先「money shot」：拉丝/截面/热气/酱汁滴落——画面本身就是钩子；proof 强调质地（酥脆纹理/流心截面/水珠食材）；禁止冷色调和平铺无光感构图",
    shotImageStyle:
      "美食写真，暖橙金色调，高饱和，侧逆光使食材纹理发光，表面有细腻光泽，背景浅焦虚化，通透有食欲感",
  },
  {
    label: "饮品茶咖",
    keywords: /奶茶|果汁|咖啡|茶饮|饮料|气泡水|豆浆|饮品|冷饮|热饮|功能饮料/,
    providerPromptStyle:
      "【饮品品类】液体视觉风格：逆光或透射光让液体颜色透亮；优先展示倒出/拉花/冒泡/颜色层次的动态帧；杯身通透质感，背景简洁衬托色彩；warm tones for 奶茶咖啡，cool/vibrant for 果汁气泡",
    shotImageStyle:
      "饮品写真，透射光使液体颜色透亮，颜色层次清晰，杯身质感通透，背景简洁，整体清新明亮",
  },
  {
    label: "美妆护肤",
    keywords: /护肤|彩妆|美妆|面膜|精华|口红|粉底|眼影|防晒|美容|护发|香水|BB霜|隔离|洁面/,
    providerPromptStyle:
      "【美妆品类】质地信任风格：柔和漫射光突出产品质地（膏体纹理/液体流动）；proof 优先手背 swipe 展示颜色/延展性，禁止上脸（AI人脸妆容失真）；色彩准确还原产品色号；整体干净明亮，背景简洁",
    shotImageStyle:
      "美妆写真，柔和漫射光，色彩准确高还原，产品质地特写清晰，手背上色过程，背景简洁不抢镜，整体明亮通透",
  },
  {
    label: "家居生活",
    keywords: /家居|收纳|清洁|厨房用品|厨具|餐具|杯子|水杯|保温杯|日用品|家装|卫浴|毛巾|浴巾|被子|枕头|床品|家纺/,
    providerPromptStyle:
      "【家居品类】真实使用场景风格：商品在真实居家环境里，自然光或暖光台灯；proof 优先「测试动作」（倒水/按压/开合）+ 工艺截面特写；色调跟随商品，整体暖白/木纹/简洁北欧感；禁止棚拍白底",
    shotImageStyle:
      "家居生活写真，真实居家场景，自然光或暖台灯光，商品在使用中，工艺细节特写，整体温馨真实，非棚拍白底",
  },
  {
    label: "家居装饰",
    keywords: /摆件|装饰|画框|香薰|蜡烛|绿植|花瓶|灯具|台灯|装饰画|相框|家居装饰/,
    providerPromptStyle:
      "【家居装饰品类】氛围感风格：商品在精心布置但不刻意的居家场景里；侧逆光制造氛围感；重点展示商品与环境的融合感，而非功能；整体色调统一（全暖或全冷），背景有层次但不杂乱",
    shotImageStyle:
      "家居装饰写真，氛围感居家场景，侧逆光，商品与环境融合自然，色调统一有质感，非广告棚拍",
  },
  {
    label: "3C数码",
    keywords: /数码|3C|耳机|手机|电脑|平板|相机|充电|智能|电子|小家电|数码配件|键盘|鼠标|音响/,
    providerPromptStyle:
      "【数码品类】科技质感风格：冷白或深色简洁背景，产品金属/玻璃光泽感突出，侧光制造边缘高光；proof 优先「实际使用动作」（戴上/插入/亮屏瞬间）+ 工艺细节特写（接口/边框/按键）；禁止平铺俯拍无光感构图",
    shotImageStyle:
      "科技产品摄影，冷白或深色背景，金属光泽感，边缘线条锐利，细节特写清晰，方向光制造高光对比，整体干净精致",
  },
  {
    label: "运动健身",
    keywords: /运动|健身|户外|跑步|瑜伽|球类|器材|保健|营养|蛋白|护具|运动服|瑜伽裤/,
    providerPromptStyle:
      "【运动品类】高能量真实风格：高对比度，运动状态中的真实动态感；proof 优先面料近景（弹力/网眼/排汗）+ 实际使用动作（局部入镜）；光线强调轮廓张力；整体充满能量，不过于广告化",
    shotImageStyle:
      "运动写真，高对比度，动态感，面料纹理清晰，局部人物使用状态，方向光强调轮廓，充满能量，真实非棚拍",
  },
  {
    label: "母婴儿童",
    keywords: /母婴|婴儿|儿童|宝宝|孕妇|玩具|辅食|奶粉|纸尿裤|童装|儿童食品/,
    providerPromptStyle:
      "【母婴品类】温馨安全风格：暖白柔光无硬阴影，色调温和干净；场景真实家庭感（不是商业摄影棚）；proof 展示商品安全/材质/使用细节，宝宝入镜只拍手脚局部；禁止强对比或冷色调",
    shotImageStyle:
      "母婴写真，暖白柔光，色调温和，安全感温馨感，真实家庭场景，柔和明亮，非商业棚拍",
  },
  {
    label: "宠物用品",
    keywords: /宠物|猫|狗|猫粮|狗粮|宠物零食|宠物玩具|猫砂|狗绳|宠物用品/,
    providerPromptStyle:
      "【宠物品类】宠物主角风格：让宠物的真实反应（扑/嗅/吃/玩）成为最有力的证明；自然光家居场景，暖色调温馨；proof 展示宠物使用商品的真实过程，不夸张；产品特写与宠物反应交替",
    shotImageStyle:
      "宠物写真，自然光暖色调，宠物真实反应特写，家居温馨场景，宠物与产品同框，非商业棚拍感",
  },
];

function getCategoryVisualPreset(category: string | undefined): CategoryVisualPreset | null {
  if (!category) return null;
  return CATEGORY_VISUAL_PRESETS.find((p) => p.keywords.test(category)) ?? null;
}

function voiceoverPreview(input: StoryboardArtifact) {
  return input.shots
    .map((shot) => `${shot.index + 1}. ${shot.voiceover}`)
    .join("\n");
}

export function buildShotPromptPromptView(
  input: BuildShotPromptPromptViewInput,
): RuntimePromptView {
  return {
    contractId: input.contractId,
    promptVersion: input.promptVersion,
    provider: input.provider,
    ...(input.model ? { model: input.model } : {}),
    nl: {
      title: "视频生成提示词",
      sections: [
        {
          id: "role",
          label: "角色",
          body: "你是 Seedance 视频生成提示词构建器。请把已确认分镜转成商家可编辑、可传给 provider 的视频生成提示词。",
        },
        {
          id: "approved_storyboard",
          label: "已确认分镜",
          body: input.storyboard.narrative,
        },
        {
          id: "voiceover_source",
          label: "口播来源",
          body: voiceoverPreview(input.storyboard) || "分镜中没有可用口播。",
        },
        {
          id: "task",
          label: "任务",
          body: "生成面向 Seedance 的提示词，必须保留商品、时间、参考素材和口播。当前链路不生成字幕。",
        },
        {
          id: "output_contract",
          label: "输出契约",
          body: "返回严格 JSON，包含 targetProvider、durationSec、aspectRatio、prompt、negativePrompt、shots、tts 和 assumptions。",
        },
      ],
    },
    variables: {
      aspectRatio: input.aspectRatio,
      storyboardShotCount: input.storyboard.shots.length,
      voiceoverSource: "shots.voiceover",
      materialRefs: input.material.assets
        .filter((asset) => asset.included)
        .map((asset) => asset.ref),
    },
  };
}

export function buildShotPromptPrompt(input: BuildShotPromptPromptInput) {
  const categoryPreset = getCategoryVisualPreset(input.brief.product.category);
  const creativeRequirements = formatCreativeRequirementsForModule(
    input.creativeRequirements,
    "shotprompt",
  );

  const runtimeLines: string[] = [
    creativeRequirements ?? "",
    "输入：",
    `画幅比例：${input.aspectRatio}`,
    `必须输出 shot 数量：${input.storyboard.shots.length}`,
    `必须输出 shot index 顺序：${input.storyboard.shots.map((shot) => shot.index).join(", ")}`,
    "已确认商品 brief：",
    JSON.stringify(input.brief),
    "已确认素材清单：",
    JSON.stringify(input.material.assets),
    "已确认分镜：",
    JSON.stringify(input.storyboard),
  ];

  if (categoryPreset) {
    runtimeLines.push(
      "",
      `品类视觉风格预设（${categoryPreset.label}）：`,
      `providerPrompt 风格基调：${categoryPreset.providerPromptStyle}`,
      `shotImage style：${categoryPreset.shotImageStyle}`,
    );
  }

  if (input.brief.bannedExpressions.length > 0) {
    runtimeLines.push(
      "",
      `合规禁用词（providerPrompt 和 voiceover 中绝对不得出现）：${input.brief.bannedExpressions.join("、")}`,
    );
  }

  return buildModulePrompt({
    moduleId: "shotprompt",
    runtimeContext: runtimeLines.filter(Boolean).join("\n"),
  }).prompt;
}
