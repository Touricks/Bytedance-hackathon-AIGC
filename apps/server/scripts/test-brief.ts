#!/usr/bin/env tsx
/**
 * 快速测试 product-brief prompt 是否正常工作
 * 运行：pnpm --filter @aigc-video/server exec tsx scripts/test-brief.ts
 */
import { generateProductBriefWithArk } from "@aigc-video/ai";

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

console.log("🚀 发送 product-brief prompt 到 Ark...\n");

const result = await generateProductBriefWithArk(
  {
    userDirection: "抖音带货竖屏，主打上班族通勤随手带，强调保温时长",
    title: "316不锈钢保温杯 500ml",
    sellingPoints: "12小时保温保冷、防漏翻盖、哑光磨砂质感",
    audience: "25-35岁城市上班族",
    material,
  },
  { env: process.env },
);

console.log("✅ 返回结果：\n");
console.log(JSON.stringify(result.productBrief, null, 2));
