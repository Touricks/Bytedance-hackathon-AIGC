#!/usr/bin/env tsx
/**
 * 真实商品端到端测试：传入本地图片 → material-intake → brief → storyboard → shotprompt
 *
 * 用法：
 *   pnpm exec tsx scripts/load-env-then.ts tsx scripts/test-e2e-real.ts \
 *     --image ./my-product.jpg \
 *     --title "商品名称" \
 *     --direction "抖音带货竖屏，主打..." \
 *     --points "卖点1、卖点2" \
 *     --audience "目标人群"
 */
import { readFileSync } from "node:fs";
import { extname } from "node:path";
import {
  generateMaterialIntakeWithArk,
  generateProductBriefWithArk,
  generateStoryboardWithArk,
  generateShotPromptWithArk,
} from "@aigc-video/ai";
import type { MaterialIntakeArtifact } from "@aigc-video/ai";

// ── 解析命令行参数 ──────────────────────────────────────────────────────────
function getArg(flag: string, fallback?: string): string {
  const i = process.argv.indexOf(flag);
  if (i !== -1 && process.argv[i + 1]) return process.argv[i + 1]!;
  if (fallback !== undefined) return fallback;
  console.error(`❌ 缺少参数 ${flag}`);
  process.exit(1);
}

const imagePath = getArg("--image");
const title = getArg("--title", "测试商品");
const direction = getArg("--direction", "抖音带货竖屏");
const sellingPoints = getArg("--points", "");
const audience = getArg("--audience", "18-35岁消费者");

// ── 读取图片为 base64 data URL ───────────────────────────────────────────────
const ext = extname(imagePath).slice(1).toLowerCase();
const mimeMap: Record<string, string> = {
  jpg: "image/jpeg", jpeg: "image/jpeg",
  png: "image/png", webp: "image/webp",
};
const mime = mimeMap[ext] ?? "image/jpeg";
const imageBytes = readFileSync(imagePath);
const base64 = imageBytes.toString("base64");
const dataUrl = `data:${mime};base64,${base64}`;

const ref = imagePath.split("/").pop() ?? "product.jpg";

function step(n: number, name: string) {
  console.log(`\n${"─".repeat(52)}`);
  console.log(`步骤 ${n}：${name}`);
  console.log("─".repeat(52));
}

// ── 1. Material Intake ──────────────────────────────────────────────────────
step(1, "Material Intake（AI 分析图片）");

const scanned: MaterialIntakeArtifact = {
  scannedAt: new Date().toISOString(),
  primaryProductRef: ref,
  assets: [
    {
      ref,
      kind: "image",
      mime,
      bytes: imageBytes.length,
      sha256: "0".repeat(64),
      role: "product_main",
      description: "",
      relevance: "high",
      usable: true,
      included: true,
    },
  ],
  rejected: [],
};

const intakeResult = await generateMaterialIntakeWithArk(
  { scanned },
  {
    env: process.env,
    imageInputs: [{ ref, url: dataUrl, mode: "data_url", detail: "high" }],
  },
);
const material = intakeResult.material;
console.log("AI 生成的素材描述：");
for (const a of material.assets) {
  console.log(`  [${a.ref}] role=${a.role} | ${a.description}`);
}

// ── 2. Product Brief ────────────────────────────────────────────────────────
step(2, "生成 Product Brief");
const briefResult = await generateProductBriefWithArk(
  { userDirection: direction, title, sellingPoints, audience, material },
  { env: process.env },
);
const brief = briefResult.productBrief;
console.log(`coreSellingPoint: ${brief.coreSellingPoint}`);
console.log(`brandTone: ${brief.brandTone}`);
console.log(`audience.painOrDesire: ${brief.audience.painOrDesire}`);

// ── 3. Storyboard ───────────────────────────────────────────────────────────
step(3, "生成 Storyboard（分镜方案）");
const storyboardResult = await generateStoryboardWithArk(
  { brief, material },
  { env: process.env },
);
const storyboard = storyboardResult.storyboard;
console.log(`narrative: ${storyboard.narrative}`);
console.log(`总时长: ${storyboard.totalDurationSec}s`);
for (const s of storyboard.shots) {
  console.log(`  shot ${s.index} [${s.durationSec}s | ${s.purpose}] ${s.scene}`);
}

// ── 4. ShotPrompt ───────────────────────────────────────────────────────────
step(4, "生成 ShotPrompt（视频生成 prompt）");
const shotResult = await generateShotPromptWithArk(
  { brief, material, storyboard, aspectRatio: "9:16" },
  { env: process.env },
);
const { shotPrompt } = shotResult;

// ── 5. 质量速览 ─────────────────────────────────────────────────────────────
console.log("\n" + "═".repeat(52));
console.log("📊 最终 providerPrompt（直接送视频模型）");
console.log("═".repeat(52));
for (const s of shotPrompt.shots) {
  const dur = s.endSec - s.startSec;
  const purpose = storyboard.shots[s.index]?.purpose ?? "?";
  console.log(`\nshot ${s.index} [${dur}s | ${purpose}]`);
  console.log(`  ${s.providerPrompt}`);
  if (s.voiceover) console.log(`  旁白: "${s.voiceover}"`);
}

console.log("\n\n── 完整 shotPrompt JSON ──");
console.log(JSON.stringify(shotPrompt, null, 2));
