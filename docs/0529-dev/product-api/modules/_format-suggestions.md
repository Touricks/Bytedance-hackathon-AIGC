# Module 文档格式建议

> 给 prompt 设计同学的写作模板。目标是让没读过代码、没碰过 Zod 的同学也能看懂每个模块在干嘛、要吃什么、要吐什么。

## 当前问题（基于现有 7 个 module 文件）

1. **格式不统一**：`material-intake.md` 用「字段 | 介绍 | 类型 | 必须」的字段级表格 + 嵌套缩进；`product-brief.md` 用「字段 | 来源 | 必须」+ 只写 schema 名字；`image-prompt.md` 又混合了 markdown 列表。Prompt 同学每打开一个文件都要重新理解格式。
2. **关键信息隐藏在代码里**：`product-brief.md` 写「Zod Output: productBriefArtifactSchema」就结束了，prompt 同学需要跳到 `packages/shared/src/schemas/artifacts.ts` 才能知道字段长什么样。
3. **缺少示例**：READ.me 推荐的固定格式里有「示例输入/输出」一项，但现有文件都没写。Prompt 工程没有示例几乎没法对齐预期。
4. **「调用时机」缺失**：模块只写了「触发接口」，但 prompt 同学没法直接看出来这个模块是在工作流的哪一步、上一步刚做完什么、下一步会发生什么。
5. **`material-intake.md` 的字段表语法不是标准 markdown**：`name | 来源 | str | y |` 缺少表头分隔行，渲染出来不是表格而是一行竖线分隔文本。

## 建议统一格式

每个模块文件遵循以下章节顺序（中文标题，非专业人士可读）：

```markdown
# <模块名>

## 1. 业务目标
> 一两句大白话：这个模块的产出在产品里给谁用。

## 2. 在工作流中的位置
> 上一步是什么 → 本模块 → 下一步是什么。让 prompt 同学知道上下文。

## 3. 触发接口
> HTTP method + path

## 4. 输入字段
> 字段级表格。每个字段都写清楚。
| 字段 | 含义（白话） | 类型 | 必须 | 来源 |

### 输入示例
> 一段真实的 JSON 示例（脱敏后），让 prompt 同学一眼能看清楚长什么样。

## 5. 输出字段
> 同样字段级。让 prompt 同学知道要 emit 什么。
| 字段 | 含义（白话） | 类型 | 必须 |

### 输出示例
> 真实 JSON 示例。

## 6. 下游消费者
> 谁会读这个输出？UI？下一个 prompt？合规审查？

## 7. 验收标准
> bullet 列表，每条都是「prompt 同学能照着 check」的具体规则。
> 例：「`shots[].index` 从 0 开始连续」「不允许出现品牌词 X、Y」

## 8. 常见失败模式
> prompt 同学最容易犯的错 + 怎么修。
> 例：「商品事实编造 → 加 system instruction 限制只引用 material 中出现的事实」
```

## 字段表写作规范

**类型**只用以下几种白话词，不用 TypeScript / Zod 语法：
- `字符串` / `字符串数组`
- `整数` / `整数数组`
- `小数`
- `布尔` (true/false)
- `枚举: A | B | C`
- `对象` / `对象数组`（嵌套时另起一张小表）
- `引用` (指向 material ref、shot id、artifact id 等)

**「必须」列**用 `是` / `否`，不用 `y/n` 或 ✓/✗。

**「含义」列**用大白话，不要直接抄 Zod 字段名翻译。
- ✗ 「`coreSellingPoint`：核心卖点」
- ✓ 「`coreSellingPoint`：这条短视频要传达的最重要的一个卖点（一句话）」

**嵌套字段**另起一张子表，子表上一行写「`assets[]` 字段子结构」。

## 示例规范

输入/输出示例都用 JSON 代码块（` ```json `），不用 YAML、不用 TypeScript。

字段值要能体现业务语义（不要 `"foo"`、`"bar"`）：
- ✗ `"name": "test"`
- ✓ `"name": "三顿半冷萃咖啡 7 颗装"`

引用类字段（`ref`、`assetId`）写成可识别的形式：
- ✓ `"primaryProductRef": "materials/product-main.jpg"`

## Output schema 同步原则

`packages/shared/src/schemas/artifacts.ts` 和 `packages/ai/src/schemas/*.ts` 是真实的 schema 源。如果文档里的字段表和代码不一致，**以代码为准**。当 prompt 同学需要改输出结构时：
1. 先在本文档里改字段表 + 更新示例；
2. 让 backend 同学同步改 schema 文件；
3. 跑 unit test 验证 schema parse 通过；
4. 不要在 PR 里只改文档不改 schema，或者反过来。
