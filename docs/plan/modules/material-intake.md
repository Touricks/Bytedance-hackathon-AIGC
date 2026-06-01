# Material Intake Prompt

## 1. 业务目标

扫描工作区 `.daireel/materials/` 下用户上传的所有素材文件，对每个文件做内容识别和分类（主商品图、参考图、规格文档、被排除项等），并给出供后续 prompt 链路使用的统一素材清单。

> 通俗解释：用户可能上传 3 张图 + 1 个 PDF + 1 段 demo 视频。这个 agent 负责告诉系统「哪张是主商品、哪张可以当参考、哪个文件是规格说明、哪些不能用」。

## 2. 在工作流中的位置

```
用户上传素材 (.daireel/materials/) → ★ material intake ★ → product brief → storyboard → ...
```

- **上一步**：用户在前端 quick upload，把素材落到 `.daireel/materials/`。
- **本步**：用户点「开始」（或前端 auto-trigger），后端读取目录下所有文件，把文件元信息 + 用户补充说明喂给 agent，agent 输出 `MaterialIntakeArtifact`。
- **下一步**：product-brief agent 把这份素材清单当输入，生成商品 brief。

## 3. 触发接口

`POST /api/workspaces/:workspaceId/material-intake/propose`

## 4. 输入字段

| 字段 | 含义（白话） | 类型 | 必须 | 来源 |
|---|---|---|---|---|
| `workspaceId` | 工作区 ID | 字符串 (uuid) | 是 | 请求 |
| `prompt` | 用户对素材的补充说明。例：「白底图是主图、demo.mp4 仅供参考构图」 | 字符串 | 否 | 请求 |
| `files[]` | 待识别的素材文件列表（从 `.daireel/materials/` 扫描得出） | 对象数组 | 是 | 后端扫描 |

### `files[]` 子结构

| 字段 | 含义（白话） | 类型 | 必须 |
|---|---|---|---|
| `name` | 文件名（相对路径），来自 `.daireel/materials/` 下 | 字符串 | 是 |
| `content` | 文件内容。图片/视频是 base64，文本是 UTF-8 | 字符串 (base64 或 文本) | 是 |
| `mime` | MIME type。例：`image/jpeg` / `video/mp4` / `text/plain` | 字符串 | 是 |
| `bytes` | 文件大小（字节） | 整数 | 是 |

> 后端注入约束：每个文件已经在上传时通过 `material.service` 校验过 size / type；这里 agent 默认所有文件都合法。

### 输入示例

```json
{
  "workspaceId": "8c7a6e4d-1b2c-4f5d-9e3a-7b8c9d0e1f2a",
  "prompt": "白底图是主图，packaging 是包装侧面，spec.txt 是规格说明，demo.mp4 仅供参考动作",
  "files": [
    {
      "name": "materials/product-main.jpg",
      "content": "<base64...>",
      "mime": "image/jpeg",
      "bytes": 245678
    },
    {
      "name": "materials/packaging-shot.jpg",
      "content": "<base64...>",
      "mime": "image/jpeg",
      "bytes": 182334
    },
    {
      "name": "materials/spec.txt",
      "content": "三顿半冷萃咖啡 7 颗装\n规格: 7 × 3g\n原料: 埃塞俄比亚水洗豆\n建议零售价: 49 元",
      "mime": "text/plain",
      "bytes": 124
    },
    {
      "name": "materials/demo.mp4",
      "content": "<base64...>",
      "mime": "video/mp4",
      "bytes": 5621345
    },
    {
      "name": "materials/random-screenshot.png",
      "content": "<base64...>",
      "mime": "image/png",
      "bytes": 312441
    }
  ]
}
```

## 5. 输出字段

模型输出会被持久化为 `MaterialIntakeArtifact`（见 `packages/shared/src/schemas/artifacts.ts`）。

| 字段 | 含义（白话） | 类型 | 必须 |
|---|---|---|---|
| `scannedAt` | 扫描时间戳 (ISO8601) | 字符串 | 是 |
| `primaryProductRef` | 主商品素材的 ref（必须等于某个 `assets[].ref`） | 字符串 | 是 |
| `assets[]` | 识别为可用的素材列表 | 对象数组 | 是 |
| `rejected[]` | 被判定不可用的素材列表 + 原因 | 对象数组 | 是（可为空数组） |

### `assets[]` 子结构

| 字段 | 含义（白话） | 类型 | 必须 |
|---|---|---|---|
| `ref` | 素材 ref（一般等于文件相对路径） | 字符串 | 是 |
| `kind` | 文件大类 | 枚举: `image` \| `video` \| `text` | 是 |
| `mime` | MIME type | 字符串 | 是 |
| `role` | 素材角色 | 枚举: `product_main` \| `product_detail` \|  `logo` \| `spec_text` \| ``other` | 是 |
| `description` | 模型对内容的描述（白话） | 字符串 | 是 |

> 关于 `role` 取值：
> - `product_main`：主商品照（白底 / 正面），通常是 primary
> - `product_detail`：商品细节
> - `logo`：品牌 logo
> - `spec_text`：规格 / 参数 / 价格文档
> - `other`：其它

### `rejected[]` 子结构

| 字段 | 含义（白话） | 类型 | 必须 |
|---|---|---|---|
| `ref` | 被排除的素材 ref | 字符串 | 是 |
| `reason` | 排除原因（一句话，让用户能看懂） | 字符串 | 是 |

### 输出示例

```json
{
  "scannedAt": "2026-05-29T08:00:00Z",
  "primaryProductRef": "materials/product-main.jpg",
  "assets": [
    {
      "ref": "materials/product-main.jpg",
      "kind": "image",
      "mime": "image/jpeg",
      "role": "product_main",
      "description": "白底产品正面照，7 颗深咖啡色咖啡胶囊整齐排列，居中构图"
    },
    {
      "ref": "materials/packaging-shot.jpg",
      "kind": "image",
      "mime": "image/jpeg",
      "role": "product_detail",
      "description": "包装盒侧面，可见『埃塞俄比亚 · 水洗 · 0 蔗糖』标识"
    },
    {
      "ref": "materials/spec.txt",
      "kind": "text",
      "mime": "text/plain",
      "role": "spec_text",
      "description": "产品规格文档：7 颗 × 3g、原料埃塞俄比亚水洗豆、建议零售价 49 元"
    },
    {
      "ref": "materials/demo.mp4",
      "kind": "video",
      "mime": "video/mp4",
      "role": "other",
      "description": "约 12 秒手部演示视频：手部抓取胶囊放入水中、胶囊溶解过程"
    }
  ],
  "rejected": [
    {
      "ref": "materials/random-screenshot.png",
      "reason": "截图内容为聊天对话框，与商品和场景均不相关"
    }
  ]
}
```

## 6. 下游消费者

- **前端素材清单页**：用户可以审阅角色分类、手动改 role / 切换 included。
- **Product Brief Agent**：读取 assets + rejected 当主要输入。
- **Storyboard Agent**：所有 `shots[].productAssetRef` 必须来自 `assets[].ref`。
- **Image Prompt Agent**：`referenceImageUsage[].assetId` 必须命中 `assets[].ref`（usable=true）。
- **`shot_asset_refs`**：用户在某个 shot 上手动绑定素材时，前端会基于 assets[] 提供候选。

## 7. 验收标准

- `primaryProductRef` 必须等于 `assets[].ref` 中某一条（即不能指向不存在的素材）。
- 必须有且仅有一条 `assets[]` 的 `role=product_main` 且 `included=true`；如果用户上传了多张主图，模型挑最清晰 / 白底的一张当 primary，其它降为 `product_detail`。
- `assets[].ref` 必须等于输入 `files[].name`，不允许重命名 / 编造。
- `assets[].sha256` 必须等于真实文件内容的 SHA-256（由后端预计算后注入，agent 仅复述；如果 agent 自己算请校验）。
- `usable=false` 的素材必须放入 `rejected[]` 并解释原因；不能两边都放。
- 文本类素材（`kind=text`）的 `description` 必须包含其中识别到的**关键事实**（规格、价格、产地等），方便下游 brief 抽取。
- 视频类素材（`kind=video`）默认 `included=false`（V2 不直接消费视频素材，仅供参考）；除非用户在 prompt 中明确要求使用。
- `description` 不能少于 10 字符，不能写成「图片」「文本」这种无信息内容。
- 输出 JSON 必须能被 `materialIntakeArtifactSchema.parse()` 解析。

## 8. 常见失败模式

| 失败现象 | 修复方向 |
|---|---|
| 找不到主商品图（用户上传都是场景图） | 模型把最像「商品本体」的一张标 product_main，并在 `assumptions`（如果加该字段）/ description 中说明不确定性；UI 提示用户确认 |
| 多张图都被标 `product_main` | system prompt 规定 product_main 全局只能有 1 个，其它降为 `product_detail` |
| `description` 写成「这是一张图片」 | system prompt 要求 description ≥ 10 字符，并明确包含「拍摄角度 + 主体 + 关键视觉元素」 |
| 文本素材 description 没抽出关键事实 | system prompt 要求 `kind=text` 时 description 必须列出识别到的规格 / 价格 / 产地 |
| 视频素材直接 `included=true`，导致下游 storyboard 把视频当主图 | system prompt 默认 `kind=video` → `included=false`；除非用户 prompt 显式要求 |
| 模型乱编 sha256 | sha256 由后端预计算注入，agent 直接复述；不要让模型自己算 |
| 把无关图直接标 `usable=true` 不进 rejected | system prompt 要求：与商品 / 场景 / 包装均不相关的素材 → `usable=false` 且必须放 rejected |
| 用户重复上传同一张图（不同文件名） | 后端在调用前做 sha256 去重并合并；agent 只看到去重后的列表 |
| 同一文件出现在 assets 和 rejected 两边 | system prompt 强约束：assets / rejected 互斥 |
