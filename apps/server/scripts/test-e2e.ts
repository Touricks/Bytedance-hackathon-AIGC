#!/usr/bin/env tsx
/**
 * 端到端 prompt 质量测试：material → brief → storyboard → shotprompt
 * 运行：pnpm exec tsx scripts/load-env-then.ts tsx scripts/test-e2e.ts
 */
import {
  generateProductBriefWithArk,
  generateStoryboardWithArk,
  generateShotPromptWithArk,
} from "@aigc-video/ai";

// ── 1. 素材（模拟扫描结果，不需要 AI）──────────────────────────────────────
const material = {
  scannedAt: new Date().toISOString(),
  primaryProductRef: "product.jpg",
  assets: [
    {
      ref: "product.jpg",
      kind: "image" as const,
      mime: "image/jpeg",
      bytes: 150000,
      sha256: "a".repeat(64),
      role: "product_main" as const,
      description: "深灰色哑光保温杯，圆柱形翻盖设计，杯身印有品牌logo",
      relevance: "high" as const,
      usable: true,
      included: true,
    },
  ],
  rejected: [],
};

function step(n: number, name: string) {
  console.log(`\n${"─".repeat(50)}`);
  console.log(`步骤 ${n}：${name}`);
  console.log("─".repeat(50));
}

// ── 2. Product Brief ────────────────────────────────────────────────────────
step(1, "生成 Product Brief");
const briefResult = await generateProductBriefWithArk(
  {
    userDirection: "抖音带货竖屏，主打上班族通勤随手带，强调保温时长",
    title: "316不锈钢保温杯 500ml",
    sellingPoints: "12小时保温保冷、防漏翻盖、哑光磨砂质感",
    audience: "25-35岁城市上班族",
    material,
  },
  { env: process.env },
);
console.log(JSON.stringify(briefResult.productBrief, null, 2));

// ── 3. Storyboard ───────────────────────────────────────────────────────────
step(2, "生成 Storyboard（分镜方案）");
const storyboardResult = await generateStoryboardWithArk(
  { brief: briefResult.productBrief, material },
  { env: process.env },
);
console.log(JSON.stringify(storyboardResult.storyboard, null, 2));

// ── 4. ShotPrompt ───────────────────────────────────────────────────────────
step(3, "生成 ShotPrompt（视频生成 prompt）");
const shotResult = await generateShotPromptWithArk(
  {
    brief: briefResult.productBrief,
    material,
    storyboard: storyboardResult.storyboard,
    aspectRatio: "9:16",
  },
  { env: process.env },
);
console.log(JSON.stringify(shotResult.shotPrompt, null, 2));

// ── 5. 质量速览 ─────────────────────────────────────────────────────────────
console.log("\n" + "═".repeat(50));
console.log("📊 质量速览");
console.log("═".repeat(50));

const shots = shotResult.shotPrompt.shots;
const storyboardShots = storyboardResult.storyboard.shots;
console.log(`\n镜头数量：${shots.length}`);
console.log("\n各镜头 providerPrompt 预览：");
for (const s of shots) {
  const dur = s.endSec - s.startSec;
  const purpose = storyboardShots[s.index]?.purpose ?? "?";
  console.log(`\n  shot ${s.index} [${dur}s | ${purpose}]`);
  console.log(`  ${s.providerPrompt}`);
  if (s.voiceover) console.log(`  旁白: "${s.voiceover}"`);
}
