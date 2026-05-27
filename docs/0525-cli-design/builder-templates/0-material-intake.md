---
name: 素材清点（⓪ material-intake / Step 0）
stage: materials
owns: .daireel/assets.json
description: |
  在 ① 产品概述之前，扫描工作目录下符合上传要求的图片/视频/文字稿，结合用户初始 prompt，
  产出一份"可引用素材清单"（asset manifest）。①/③ 的素材引用只能指向此清单。
  两段式：先确定性扫描+校验，再多模态打标。
  边界是素材清点与校验；不做创意、不生成剧本/分镜。
---

# ⓪ 素材清点 builder（Step 0）

## 角色定位
负责"这个工作目录里**有哪些可被引用的合法素材、各是什么、跟需求多相关**"。把"裸文件名引用"升级为"对一份已校验清单的引用"，补上 ① 缺失的素材引用环节。

## 输入契约（读）
- 工作目录文件扫描（排除 `.daireel/`、隐藏文件/目录）
- 用户初始 prompt（用于相关性判断）

## 两段式（确定性在前、LLM 在后）
| 段 | 谁 | 做什么 |
|---|---|---|
| **1. 扫描+校验** | 代码（非 LLM） | 按上传要求过滤（见下），产出 `mime/bytes/sha256/usable`；不合格进 `rejected[]` |
| **2. 相关性打标** | Seedpro（多模态） | 仅对 `usable` 文件 + 初始 prompt → 标 `role`/`description`/`relevance`，建议 `primary_product_ref` |

### 上传要求（段1 过滤规则）
- 允许类型：图 `jpg/png/webp`、视频 `mp4/mov/webm`、文字稿 `txt/md/docx`
- 图片须为**真实位图字节**（复用 arc_codex `image-validation`，拒伪造/损坏）
- 大小上限（图/视频/文字各设阈值）；超限或类型不符 → `rejected[]`
- 排除 `.daireel/`、点文件、生成产物

## 输出契约（写 `.daireel/assets.json`，合 schema）
```jsonc
{
  "scanned_at": "ISO8601",
  "primary_product_ref": "product.jpg",        // 段2 建议主图；用户可改
  "assets": [
    {
      "ref": "product.jpg", "kind": "image|video|text",
      "mime": "image/jpeg", "bytes": 532781, "sha256": "…",   // 段1 确定性
      "role": "product_main|product_detail|packaging|logo|demo_video|spec_text|reference|other", // 段2
      "description": "正面白底主图",            // 段2
      "relevance": "high|medium|low",           // 段2（对初始 prompt 的相关度）
      "usable": true,
      "included": true                          // 用户在 Web 可勾选纳入/排除
    }
  ],
  "rejected": [ { "ref": "raw.tiff", "reason": "格式不支持/超大/非真实位图" } ]
  // _meta 见 README §3.3
}
```

## 三层归属
- **schema**：上面的 manifest 字段；`role`/`relevance`/`kind` 用枚举。
- **builder（仅段2）**：怎么判定 `role`/`relevance`——以"这是不是被推广的主体商品、能否作 image-to-video 精确参考"为准；拿不准标 `relevance:low / role:other`，不强行归类。
- **pacing**：无。

## 工作流程
1. 段1：扫描工作目录 → 按上传要求过滤 → 写 `usable`/`rejected` 与 `mime/bytes/sha256`。
2. 段2：把 `usable` 文件（图取缩略、视频取首帧）+ 初始 prompt 交 Seedpro → 标 `role/description/relevance` + 选 `primary_product_ref`。
3. 写 `assets.json`，置状态 `materials_ready`，返回摘要（可用数/拒绝数/建议主图）。

## 人审（轻量，默认自动推进）
- `assets.json` 在 Web 可编辑：勾选 `included` 纳入/排除、改 `primary_product_ref`、改 `role`。
- **不挡流程**：用户不干预则自动进入 ①。

## 边界
- **做**：扫描、校验、相关性打标、主图建议、清单维护。
- **不做**：抓取商品链接（P1）、文生图补素材、剧本/分镜创意、切片/Embedding 检索（P1 素材库）。

## 自检清单
- 是否排除了 `.daireel/` 与点文件？
- 每个 `usable:true` 项是否都有 `mime/bytes/sha256`？
- `primary_product_ref` 是否指向一个 `usable:true && included:true` 的图片？
- 拒绝项是否都带了可读 `reason`？
