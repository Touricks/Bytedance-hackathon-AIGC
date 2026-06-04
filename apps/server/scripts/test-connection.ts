#!/usr/bin/env tsx
import { generateTextWithArk } from "@aigc-video/ai";

const apiKey = process.env.ARK_API_KEY ?? "";
const endpointId = process.env.ARK_TEXT_ENDPOINT_ID ?? "";
const baseURL = process.env.ARK_BASE_URL ?? "https://ark.cn-beijing.volces.com/api/v3";

console.log("测试 endpoint:", endpointId);

const res = await generateTextWithArk(
  { prompt: "用一句话介绍你自己", content: "用一句话介绍你自己" },
  { provider: "ark", apiKey, model: endpointId, baseURL },
);

console.log("✅ 成功！模型回复：", res.output);
