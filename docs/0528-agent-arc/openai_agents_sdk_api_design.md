# 基于 OpenAI Agents SDK 的项目 API 设计草案

> 适用项目：电商 AIGC 带货视频生成系统  
> 技术栈假设：Node.js + TypeScript + Fastify/NestJS + OpenAI Agents SDK + Zod + Postgres + Redis/BullMQ 或 Temporal  
> 核心原则：Agent 负责“智能生成与判断”，业务工作流负责“状态、版本、审批、异步任务与最终确定性编译”。

---

## 1. 本项目需要掌握的 OpenAI Agents SDK 能力

### 1.1 Agent 定义

项目中每个 Agent 应该聚焦一个清晰职责，而不是做成一个“大而全的自动化 Agent”。

需要掌握：

- `new Agent({ name, instructions, model, tools, outputType, handoffs, inputGuardrails, outputGuardrails })`
- `instructions`：系统提示词，可以从本地 prompt registry 拼接
- `model` / `modelSettings`：按任务选择模型、控制温度、工具调用策略
- `outputType`：用 Zod 或 JSON Schema 约束结构化输出
- `tools`：给 Agent 注入可调用能力
- `handoffs`：把对话或任务交给专门 Agent
- `Agent.asTool()`：把一个 Agent 暴露成另一个 Agent 的工具

推荐的本项目 Agent 粒度：

```txt
MaterialIntakeAgent
BriefAgent
StoryboardAgent
ShotPromptAgent
StoryboardImagePromptAgent
VideoShotScriptAgent
ArtifactReviewAgent
ArtifactRepairAgent
DecisionPlannerAgent
TraceSummaryAgent
```

不要让 Agent 直接决定所有业务状态。状态推进仍由后端 Workflow Service 控制。

---

### 1.2 Runner / run 调用

推荐在服务启动时创建共享 Runner；简单场景可以直接用 `run()`。

```ts
import { Agent, Runner, run } from '@openai/agents';

const runner = new Runner({
  // 可配置统一 modelProvider、trace、全局运行参数
});

const result = await runner.run(storyboardImagePromptAgent, JSON.stringify(input), {
  context: {
    workspaceId,
    userId,
    traceId,
    artifactRepo,
    assetRepo,
  },
  maxTurns: 6,
});

const output = result.finalOutput;
```

项目中建议封装统一入口：

```ts
export async function runAgentWithTrace<T>(input: {
  agentName: string;
  agent: Agent<any, any>;
  payload: unknown;
  context: AgentRunContext;
  maxTurns?: number;
}): Promise<T> {
  const result = await runner.run(input.agent, JSON.stringify(input.payload), {
    context: input.context,
    maxTurns: input.maxTurns ?? 6,
  });

  if (!result.finalOutput) {
    throw new AgentRunError('EMPTY_FINAL_OUTPUT', 'Agent returned empty finalOutput');
  }

  return result.finalOutput as T;
}
```

---

### 1.3 Local Context 与 LLM Context

需要区分两类 context：

```txt
Local Context:
  给工具、hooks、handoffs、guardrails 使用。
  例如 db、workspaceId、userId、traceId、feature flags。

LLM Context:
  模型真正能看到的上下文。
  例如商品简介、素材摘要、分镜目标、用户修改意见。
```

关键注意点：

- `run(..., { context })` 中的 context 不会自动进入模型上下文。
- 模型需要看到的信息必须进入 `input`、`instructions`、tool 返回值或 message history。
- 不要把敏感服务端对象拼进 LLM 上下文。

推荐上下文结构：

```ts
export interface AgentRunContext {
  workspaceId: string;
  userId: string;
  traceId: string;
  runtimeMode: 'real' | 'mock' | 'fallback';
  artifactRepo: ArtifactRepository;
  assetRepo: AssetRepository;
  jobRepo: JobRepository;
  policy: {
    maxImageBatchSize: number;
    maxVideoBatchSize: number;
    allowExpensiveTools: boolean;
  };
}
```

---

## 2. Tool Use 设计

### 2.1 Tool 分层原则

本项目的工具不应一股脑全部暴露给模型。建议分成三类：

```txt
Read Tools:
  retrieveAssets
  getWorkspaceArtifacts
  searchAssetTags
  getSelectedNeighborImages

Write Tools:
  saveDraftArtifact
  createReviewRecord
  markArtifactStale

Expensive / Side-effect Tools:
  createImageGenerationBatch
  createVideoGenerationBatch
  triggerSeedanceVideoJob
  exportFinalVideo
```

默认策略：

- P0/P1：大部分写操作和昂贵操作由后端 workflow 直接调用，不让模型自己调用。
- P2 Agent orchestration demo：可以允许 Planner Agent 选择工具，但必须通过 allowlist 和审批规则。

---

### 2.2 Function Tool 基础写法

```ts
import { tool } from '@openai/agents';
import { z } from 'zod';

export const searchAssetsTool = tool({
  name: 'search_assets',
  description: 'Search workspace assets by product role, tags, shot objective, or keyword.',
  parameters: z.object({
    workspaceId: z.string(),
    query: z.string().min(1),
    assetRoles: z.array(z.enum(['product_main', 'product_detail', 'reference', 'lifestyle'])).optional(),
    limit: z.number().int().min(1).max(20).default(8),
  }),
  timeoutMs: 3000,
  async execute(args, runContext) {
    const ctx = runContext?.context as AgentRunContext;

    if (args.workspaceId !== ctx.workspaceId) {
      return {
        ok: false,
        errorCode: 'WORKSPACE_MISMATCH',
        message: 'The requested workspace does not match current run context.',
      };
    }

    const assets = await ctx.assetRepo.search({
      workspaceId: args.workspaceId,
      query: args.query,
      assetRoles: args.assetRoles,
      limit: args.limit,
    });

    return {
      ok: true,
      assets: assets.map((asset) => ({
        id: asset.id,
        role: asset.role,
        tags: asset.tags,
        summary: asset.summary,
      })),
    };
  },
});
```

### 2.3 Tool 参数设计规范

每个 tool 的参数必须满足：

```txt
1. 参数名清晰，不使用 data/input/payload 这类大杂烩字段。
2. 对枚举值使用 enum。
3. 对数组设置合理上限。
4. 对危险操作增加 confirm 字段或 needsApproval。
5. 所有 tool 返回值都要有 ok / errorCode / message。
6. 不在 tool 返回值中泄露内部 stack trace、密钥、绝对文件路径。
```

推荐通用返回格式：

```ts
export type ToolResult<T> =
  | {
      ok: true;
      data: T;
      warnings?: string[];
    }
  | {
      ok: false;
      errorCode: string;
      message: string;
      repairHint?: string;
      retryable?: boolean;
    };
```

---

### 2.4 Tool Guardrails

对工具调用前后加校验，尤其是昂贵工具和写库工具。

示例：禁止模型一次性生成超过 5 个分镜视频。

```ts
import { tool } from '@openai/agents';
import { z } from 'zod';

export const createVideoBatchTool = tool({
  name: 'create_video_generation_batch',
  description: 'Create a video generation batch for one shot script.',
  parameters: z.object({
    workspaceId: z.string(),
    shotId: z.string(),
    scriptArtifactId: z.string(),
    count: z.number().int().min(1).max(5),
  }),
  inputGuardrails: [
    async ({ args, context }) => {
      const ctx = context as AgentRunContext;
      if (!ctx.policy.allowExpensiveTools) {
        return {
          behavior: 'rejectContent',
          message: 'Expensive generation tools are disabled for this run.',
        };
      }
      if (args.count > ctx.policy.maxVideoBatchSize) {
        return {
          behavior: 'rejectContent',
          message: `count must be <= ${ctx.policy.maxVideoBatchSize}`,
        };
      }
      return { behavior: 'allow' };
    },
  ],
  async execute(args, runContext) {
    const ctx = runContext?.context as AgentRunContext;
    const batch = await ctx.jobRepo.createVideoBatch(args);
    return { ok: true, data: { batchId: batch.id } };
  },
});
```

---

## 3. JSON Schema / Zod 结构化输出设计

### 3.1 用 Zod 做开发期类型源头

推荐本项目使用 Zod 作为 TypeScript 源头 schema，再按需要导出 JSON Schema。

```ts
import { z } from 'zod';

export const VideoShotScriptSchema = z.object({
  schemaVersion: z.literal('video-shot-script.v1'),
  shotId: z.string(),
  durationSec: z.number().int().min(1).max(8),
  shotGoal: z.string().min(4),
  startFrameDescription: z.string().min(8),
  endFrameDescription: z.string().min(8),
  cameraMotion: z.enum(['static', 'push_in', 'pull_out', 'pan', 'tilt', 'handheld', 'orbit']),
  subjectMotion: z.string().min(8),
  productVisibility: z.enum(['hero', 'clear', 'partial', 'background']),
  voiceover: z.string().optional(),
  onscreenText: z.string().optional(),
  providerPrompt: z.string().min(30),
});

export type VideoShotScript = z.infer<typeof VideoShotScriptSchema>;
```

Agent 使用：

```ts
export const videoShotScriptAgent = new Agent({
  name: 'VideoShotScriptAgent',
  model: 'gpt-5.5',
  instructions: loadPrompt('video-shot-script.v1.md'),
  outputType: VideoShotScriptSchema,
});
```

---

### 3.2 Schema Registry

所有 artifact schema 都应该有版本。

```txt
packages/ai/schemas/
  material-intake.v1.schema.ts
  brief.v1.schema.ts
  storyboard.v1.schema.ts
  shotprompt.v1.schema.ts
  storyboard-image-prompt.v1.schema.ts
  video-shot-script.v1.schema.ts
  decision-plan.v1.schema.ts
  repair-request.v1.schema.ts
  validation-error.v1.schema.ts
```

推荐注册表：

```ts
export const SchemaRegistry = {
  'storyboard-image-prompt.v1': StoryboardImagePromptSchema,
  'video-shot-script.v1': VideoShotScriptSchema,
  'decision-plan.v1': DecisionPlanSchema,
  'repair-request.v1': RepairRequestSchema,
} as const;

export function parseArtifact<T>(schemaName: keyof typeof SchemaRegistry, data: unknown): T {
  return SchemaRegistry[schemaName].parse(data) as T;
}
```

---

### 3.3 严格结构化输出规范

每个 Agent 输出都建议包含：

```txt
schemaVersion
artifactType
workspaceId 或 shotId
主要结构字段
providerPrompt / prompt / plan 等核心字段
warnings
assumptions
```

避免输出：

```txt
markdown 包裹 JSON
解释性正文 + JSON 混合
动态 key
过深嵌套
过大的自由文本字段
```

---

## 4. 基于请求头和验证错误的修正请求设计

这是本项目非常重要的稳定性模块。建议将“生成失败修正”设计为一个标准流程，而不是散落在各个 API 中。

### 4.1 推荐请求头

所有 Agent/Artifact 相关 API 推荐统一支持以下 headers：

```http
Authorization: Bearer <token>
X-Workspace-Id: wsp_123
X-User-Id: usr_123
X-Trace-Id: trc_123
X-Request-Id: req_123
Idempotency-Key: idem_123
X-Agent-Mode: workflow | planner | repair
X-Decision-Mode: tree | model | hybrid
X-Provider-Mode: real | mock | fallback
X-Validation-Mode: strict | auto-repair | manual
X-Schema-Name: video-shot-script.v1
X-Artifact-Version: 3
X-Client-Stage: storyboard_image | video_script | video_batch
```

含义：

| Header | 用途 |
|---|---|
| `X-Trace-Id` | 串联 API、Agent run、tool call、job、provider 调用 |
| `Idempotency-Key` | 防止用户重复点击导致重复生成 |
| `X-Agent-Mode` | 标识本次调用是正常生成、planner 决策还是修复 |
| `X-Decision-Mode` | 使用预配置决策树、模型决策或混合模式 |
| `X-Provider-Mode` | 真实 provider / mock / fallback |
| `X-Validation-Mode` | 校验失败后直接报错、自动修复或要求用户手动修 |
| `X-Schema-Name` | 指定期望 artifact schema |
| `X-Artifact-Version` | 防止基于旧版本提交修改 |

---

### 4.2 标准验证错误响应

HTTP 422：

```json
{
  "ok": false,
  "error": {
    "code": "ARTIFACT_VALIDATION_FAILED",
    "message": "VideoShotScriptArtifact validation failed.",
    "schemaName": "video-shot-script.v1",
    "schemaVersion": "v1",
    "traceId": "trc_123",
    "artifactId": "art_123",
    "validationErrors": [
      {
        "path": "durationSec",
        "code": "too_big",
        "message": "durationSec must be <= 8",
        "expected": "integer <= 8",
        "actual": 12,
        "severity": "error",
        "repairable": true,
        "repairHint": "Clamp durationSec to the user-selected or provider-supported range."
      },
      {
        "path": "providerPrompt",
        "code": "too_small",
        "message": "providerPrompt must contain at least 30 characters",
        "expected": "string length >= 30",
        "actual": "",
        "severity": "error",
        "repairable": true,
        "repairHint": "Generate a provider-ready video prompt based on the script fields."
      }
    ]
  },
  "nextAction": "REPAIR_ARTIFACT"
}
```

---

### 4.3 修正请求 API

```http
POST /api/workspaces/:workspaceId/artifacts/:artifactId/repair
```

请求体：

```json
{
  "schemaName": "video-shot-script.v1",
  "mode": "auto",
  "baseArtifactVersion": 3,
  "originalArtifact": {
    "schemaVersion": "video-shot-script.v1",
    "shotId": "shot_03",
    "durationSec": 12,
    "providerPrompt": ""
  },
  "validationErrors": [
    {
      "path": "durationSec",
      "code": "too_big",
      "message": "durationSec must be <= 8",
      "repairHint": "Clamp durationSec to <= 8."
    },
    {
      "path": "providerPrompt",
      "code": "too_small",
      "message": "providerPrompt must contain at least 30 characters",
      "repairHint": "Regenerate providerPrompt from existing fields."
    }
  ],
  "userInstruction": "保持镜头运动，但缩短为 6 秒。",
  "requestHeaderSnapshot": {
    "x-trace-id": "trc_123",
    "x-validation-mode": "auto-repair",
    "x-provider-mode": "real"
  }
}
```

响应：

```json
{
  "ok": true,
  "artifact": {
    "id": "art_124",
    "schemaName": "video-shot-script.v1",
    "version": 4,
    "createdBy": "repair-agent",
    "data": {
      "schemaVersion": "video-shot-script.v1",
      "shotId": "shot_03",
      "durationSec": 6,
      "providerPrompt": "..."
    }
  },
  "validation": {
    "ok": true,
    "remainingErrors": []
  },
  "nextAction": "APPROVE_OR_GENERATE_VIDEO"
}
```

---

### 4.4 Repair Agent Schema

```ts
export const ArtifactRepairOutputSchema = z.object({
  schemaVersion: z.literal('artifact-repair-output.v1'),
  repairSummary: z.string(),
  changedPaths: z.array(z.string()),
  correctedArtifact: z.unknown(),
  unresolvedIssues: z.array(
    z.object({
      path: z.string(),
      reason: z.string(),
      requiresUserInput: z.boolean(),
    }),
  ),
});
```

Repair Agent 要遵守：

```txt
1. 只能修复 validationErrors 指定的字段，除非 userInstruction 明确要求扩展修改。
2. 不得改变 artifactId、workspaceId、shotId 等身份字段。
3. 不得绕过 provider 限制，例如 durationSec 上限。
4. 修复后必须再次通过 SchemaRegistry 校验。
5. 自动修复最多重试 1-2 次，避免循环。
```

---

### 4.5 自动修复流程

```txt
Agent 生成 artifact
  -> Zod 校验
    -> 通过：保存 artifact
    -> 失败：生成 ValidationError[]
      -> X-Validation-Mode = strict：返回 422
      -> X-Validation-Mode = manual：返回 422 + 可编辑字段
      -> X-Validation-Mode = auto-repair：调用 ArtifactRepairAgent
          -> 再次 Zod 校验
              -> 通过：保存 repaired artifact
              -> 失败：返回 422 + remainingErrors
```

伪代码：

```ts
async function generateAndValidateArtifact<T>(input: {
  agent: Agent<any, any>;
  schemaName: keyof typeof SchemaRegistry;
  payload: unknown;
  headers: NormalizedAgentHeaders;
  context: AgentRunContext;
}): Promise<T> {
  const rawOutput = await runAgentWithTrace<unknown>({
    agentName: input.agent.name,
    agent: input.agent,
    payload: input.payload,
    context: input.context,
  });

  const parsed = SchemaRegistry[input.schemaName].safeParse(rawOutput);

  if (parsed.success) return parsed.data as T;

  const validationErrors = toValidationErrors(parsed.error);

  if (input.headers.validationMode !== 'auto-repair') {
    throw new ArtifactValidationError(input.schemaName, validationErrors);
  }

  const repaired = await repairArtifact({
    schemaName: input.schemaName,
    originalArtifact: rawOutput,
    validationErrors,
    headers: input.headers,
    context: input.context,
  });

  const repairedParsed = SchemaRegistry[input.schemaName].safeParse(repaired);
  if (!repairedParsed.success) {
    throw new ArtifactValidationError(input.schemaName, toValidationErrors(repairedParsed.error));
  }

  return repairedParsed.data as T;
}
```

---

## 5. 预配置决策树设计

预配置决策树适合 P0/P1，因为它稳定、可测试、可解释。

### 5.1 决策树适用场景

```txt
选择创作模板
选择镜头数量
选择图片生成策略
选择视频时长上限
选择真实 provider / mock provider
选择是否进入自动修复
选择是否需要人工 approve
选择 nextAction
```

### 5.2 决策树 DSL

建议放在本地 JSON/YAML 中：

```txt
packages/ai/decision-trees/
  ecommerce-short-video.p0.json
  ecommerce-short-video.p1.json
  template-selection.p1.json
  provider-fallback.p0.json
```

示例：

```json
{
  "treeId": "template-selection.p1",
  "version": 1,
  "description": "Select creative template based on product category, user preference, and available assets.",
  "inputs": [
    "productCategory",
    "userStylePreference",
    "hasLifestyleReference",
    "targetPlatform",
    "durationSec"
  ],
  "root": {
    "type": "condition",
    "if": {
      "field": "userStylePreference",
      "op": "eq",
      "value": "unboxing"
    },
    "then": {
      "type": "decision",
      "decision": {
        "templateId": "unboxing_v1",
        "storyboardStyle": "step_by_step_unboxing",
        "imagePromptStyle": "clean_product_demo",
        "riskLevel": "low"
      }
    },
    "else": {
      "type": "condition",
      "if": {
        "field": "hasLifestyleReference",
        "op": "eq",
        "value": true
      },
      "then": {
        "type": "decision",
        "decision": {
          "templateId": "lifestyle_seed_v1",
          "storyboardStyle": "scene_based_recommendation",
          "imagePromptStyle": "lifestyle_context",
          "riskLevel": "medium"
        }
      },
      "else": {
        "type": "decision",
        "decision": {
          "templateId": "strong_selling_points_v1",
          "storyboardStyle": "benefit_first",
          "imagePromptStyle": "product_hero",
          "riskLevel": "low"
        }
      }
    }
  }
}
```

### 5.3 Decision Engine

```ts
export interface DecisionInput {
  productCategory?: string;
  userStylePreference?: string;
  hasLifestyleReference: boolean;
  targetPlatform: 'tiktok' | 'douyin' | 'xiaohongshu' | 'generic';
  durationSec: number;
  runtimeMode: 'real' | 'mock' | 'fallback';
}

export interface DecisionOutput {
  treeId: string;
  version: number;
  decision: Record<string, unknown>;
  matchedPath: string[];
  explanation: string;
}

export function evaluateDecisionTree(tree: DecisionTree, input: DecisionInput): DecisionOutput {
  // 递归遍历 condition / decision / action 节点
  // 返回 matchedPath，便于 trace 展示
  throw new Error('implementation');
}
```

决策树输出必须写入 trace：

```json
{
  "eventType": "decision_tree_evaluated",
  "treeId": "template-selection.p1",
  "matchedPath": ["root", "else", "then"],
  "decision": {
    "templateId": "lifestyle_seed_v1"
  }
}
```

---

## 6. 模型驱动决策模板设计

模型驱动决策适合 P2：素材召回、模板选择、策略推荐、A/B 优化建议。它不应该直接执行危险操作，而应该输出一个结构化 plan，再由后端验证和执行。

### 6.1 Decision Planner 输出 Schema

```ts
export const DecisionPlanSchema = z.object({
  schemaVersion: z.literal('decision-plan.v1'),
  objective: z.string(),
  selectedTemplateId: z.string(),
  strategy: z.object({
    hookStyle: z.enum(['problem_solution', 'before_after', 'direct_benefit', 'ugc_recommendation', 'unboxing']),
    pacing: z.enum(['fast', 'medium', 'slow']),
    visualStyle: z.enum(['product_hero', 'lifestyle', 'demo', 'testimonial', 'comparison']),
    riskLevel: z.enum(['low', 'medium', 'high']),
  }),
  requiredTools: z.array(
    z.object({
      toolName: z.enum([
        'search_assets',
        'get_workspace_artifacts',
        'generate_storyboard_variant',
        'generate_image_prompt',
        'create_image_generation_batch',
        'generate_video_script',
      ]),
      reason: z.string(),
      allowed: z.boolean(),
    }),
  ),
  nextSteps: z.array(
    z.object({
      stepId: z.string(),
      action: z.enum([
        'retrieve_assets',
        'generate_brief',
        'generate_storyboard',
        'generate_image_prompt',
        'wait_user_selection',
        'generate_video_script',
        'wait_user_edit',
        'generate_video_batch',
      ]),
      inputRefs: z.array(z.string()),
      outputRef: z.string(),
      requiresHumanApproval: z.boolean(),
    }),
  ),
  reasoningSummary: z.string(),
  assumptions: z.array(z.string()),
  warnings: z.array(z.string()),
});
```

### 6.2 Decision Planner Agent

```ts
export const decisionPlannerAgent = new Agent({
  name: 'DecisionPlannerAgent',
  model: 'gpt-5.5',
  instructions: `
你是电商短视频工作流策略规划器。
你只能从 allowlist 中选择模板、工具和下一步动作。
你不直接执行工具，只输出 decision-plan.v1。
如果信息不足，使用 requiresHumanApproval 或 wait_user_selection。
不得绕过 workflow 状态机。
`.trim(),
  outputType: DecisionPlanSchema,
});
```

### 6.3 模型决策执行流程

```txt
Workflow 收集上下文
  -> 预配置决策树给出 hard constraints / allowlist
  -> DecisionPlannerAgent 输出 DecisionPlan
  -> DecisionPlanValidator 校验：
       1. toolName 是否在 allowlist
       2. nextSteps 是否符合状态机
       3. 是否包含危险操作
       4. 是否超过成本预算
  -> DecisionExecutor 只执行通过校验的 step
  -> 所有执行结果写入 trace
```

伪代码：

```ts
async function planWithModel(input: PlannerInput): Promise<DecisionPlan> {
  const treeDecision = evaluateDecisionTree(templateTree, input.features);

  const plan = await runAgentWithTrace<DecisionPlan>({
    agentName: 'DecisionPlannerAgent',
    agent: decisionPlannerAgent,
    payload: {
      objective: input.objective,
      workspaceSummary: input.workspaceSummary,
      availableTemplates: treeDecision.decision.allowedTemplates,
      allowedTools: treeDecision.decision.allowedTools,
      currentState: input.currentState,
      constraints: input.constraints,
    },
    context: input.context,
  });

  const validation = validateDecisionPlan(plan, {
    allowedTemplates: treeDecision.decision.allowedTemplates,
    allowedTools: treeDecision.decision.allowedTools,
    allowedNextActions: input.allowedNextActions,
  });

  if (!validation.ok) {
    throw new DecisionPlanValidationError(validation.errors);
  }

  return plan;
}
```

---

## 7. Tree / Model / Hybrid 三种决策模式

### 7.1 `tree` 模式

```txt
特点：确定性、可测试、成本低。
适用：P0、演示兜底、provider fallback、nextAction。
```

```http
X-Decision-Mode: tree
```

### 7.2 `model` 模式

```txt
特点：灵活、能解释、能结合上下文，但需要严格校验。
适用：P2 Agent orchestration demo、A/B 优化建议、评论驱动二创。
```

```http
X-Decision-Mode: model
```

### 7.3 `hybrid` 模式

```txt
特点：规则给边界，模型做选择。
适用：P1/P2 主推。
```

```http
X-Decision-Mode: hybrid
```

推荐实际采用：

```txt
P0: tree
P1: tree + 局部 model
P2: hybrid
```

---

## 8. API 设计清单

### 8.1 Agent Run API

内部 API，不一定直接暴露给前端。

```http
POST /api/agent-runs
```

请求：

```json
{
  "agentName": "VideoShotScriptAgent",
  "schemaName": "video-shot-script.v1",
  "input": {
    "workspaceId": "wsp_123",
    "shotId": "shot_03",
    "selectedImageId": "img_123",
    "neighborImageIds": ["img_122", "img_124"],
    "durationSec": 6
  },
  "options": {
    "validationMode": "auto-repair",
    "runtimeMode": "real",
    "maxTurns": 6
  }
}
```

响应：

```json
{
  "ok": true,
  "runId": "run_123",
  "traceId": "trc_123",
  "artifactId": "art_456",
  "output": {},
  "validation": {
    "ok": true
  },
  "nextAction": "APPROVE_OR_GENERATE_VIDEO"
}
```

---

### 8.2 图 Prompt 生成 API

```http
POST /api/workspaces/:workspaceId/shots/:shotId/image-prompt/propose
```

```json
{
  "referenceImageIds": ["asset_1", "asset_2"],
  "userInstruction": "画面更偏生活方式，保留商品主体清晰。",
  "templateId": "lifestyle_seed_v1"
}
```

响应：

```json
{
  "ok": true,
  "artifact": {
    "id": "art_img_prompt_1",
    "schemaName": "storyboard-image-prompt.v1",
    "version": 1,
    "data": {
      "prompt": "...",
      "negativePrompt": "...",
      "referenceImageUsage": []
    }
  },
  "nextAction": "GENERATE_3_IMAGES"
}
```

---

### 8.3 生成 3 张分镜图 API

```http
POST /api/workspaces/:workspaceId/shots/:shotId/image-batches
```

```json
{
  "imagePromptArtifactId": "art_img_prompt_1",
  "count": 3,
  "aspectRatio": "9:16"
}
```

响应：

```json
{
  "ok": true,
  "batchId": "img_batch_1",
  "status": "PENDING",
  "pollUrl": "/api/image-batches/img_batch_1",
  "nextAction": "POLL_IMAGE_BATCH"
}
```

---

### 8.4 选中分镜图 API

```http
POST /api/workspaces/:workspaceId/shots/:shotId/selected-image
```

```json
{
  "imageCandidateId": "img_candidate_2",
  "imageBatchId": "img_batch_1"
}
```

响应：

```json
{
  "ok": true,
  "selection": {
    "shotId": "shot_03",
    "selectedImageId": "img_candidate_2"
  },
  "staleArtifacts": [
    {
      "artifactId": "video_script_old_1",
      "reason": "selected image changed"
    }
  ],
  "nextAction": "GENERATE_VIDEO_SCRIPT"
}
```

---

### 8.5 视频分镜剧本生成 API

```http
POST /api/workspaces/:workspaceId/shots/:shotId/video-script/propose
```

```json
{
  "durationSec": 6,
  "selectedImageId": "img_candidate_2",
  "useNeighborFrames": true,
  "userInstruction": "镜头从产品特写拉到使用场景。"
}
```

响应：

```json
{
  "ok": true,
  "artifact": {
    "id": "video_script_1",
    "schemaName": "video-shot-script.v1",
    "version": 1,
    "data": {
      "durationSec": 6,
      "cameraMotion": "pull_out",
      "providerPrompt": "..."
    }
  },
  "nextAction": "EDIT_OR_GENERATE_5_VIDEOS"
}
```

---

### 8.6 用户编辑剧本 API

```http
PATCH /api/workspaces/:workspaceId/shots/:shotId/video-script/:artifactId
```

```json
{
  "baseVersion": 1,
  "patch": {
    "durationSec": 5,
    "cameraMotion": "push_in",
    "providerPrompt": "..."
  }
}
```

响应：

```json
{
  "ok": true,
  "artifact": {
    "id": "video_script_2",
    "version": 2,
    "createdBy": "user"
  },
  "validation": {
    "ok": true
  },
  "nextAction": "GENERATE_5_VIDEOS"
}
```

---

### 8.7 生成 5 个分镜视频 API

```http
POST /api/workspaces/:workspaceId/shots/:shotId/video-batches
```

```json
{
  "videoScriptArtifactId": "video_script_2",
  "count": 5
}
```

响应：

```json
{
  "ok": true,
  "batchId": "video_batch_1",
  "status": "PENDING",
  "pollUrl": "/api/video-batches/video_batch_1",
  "nextAction": "POLL_VIDEO_BATCH"
}
```

---

### 8.8 决策 API

```http
POST /api/workspaces/:workspaceId/decision/plan
```

请求头：

```http
X-Decision-Mode: hybrid
X-Validation-Mode: strict
```

请求：

```json
{
  "objective": "为当前商品生成更适合 TikTok 的带货视频策略",
  "currentStage": "storyboard",
  "availableActions": [
    "generate_storyboard",
    "generate_image_prompt",
    "wait_user_selection"
  ],
  "features": {
    "productCategory": "skincare",
    "hasLifestyleReference": true,
    "targetPlatform": "tiktok",
    "durationSec": 15
  }
}
```

响应：

```json
{
  "ok": true,
  "mode": "hybrid",
  "treeDecision": {
    "templateId": "lifestyle_seed_v1",
    "matchedPath": ["root", "else", "then"]
  },
  "modelPlan": {
    "schemaVersion": "decision-plan.v1",
    "selectedTemplateId": "lifestyle_seed_v1",
    "nextSteps": []
  },
  "nextAction": "APPLY_DECISION_PLAN"
}
```

---

## 9. 推荐模块划分

```txt
packages/ai/
  agents/
    material-intake.agent.ts
    brief.agent.ts
    storyboard.agent.ts
    shotprompt.agent.ts
    storyboard-image-prompt.agent.ts
    video-shot-script.agent.ts
    artifact-review.agent.ts
    artifact-repair.agent.ts
    decision-planner.agent.ts
    trace-summary.agent.ts
  schemas/
    *.schema.ts
  tools/
    read-tools.ts
    write-tools.ts
    generation-tools.ts
    validation-tools.ts
  prompts/
    shared/
    material-intake/
    brief/
    storyboard/
    shotprompt/
    image-prompt/
    video-script/
    repair/
    decision/
  decision-trees/
    template-selection.p1.json
    provider-fallback.p0.json
  runtime/
    runner.ts
    run-agent-with-trace.ts
    validation-repair.ts
  registry/
    prompt-registry.ts
    schema-registry.ts
    agent-registry.ts
    tool-registry.ts

apps/server/src/modules/
  workspace/
  assets/
  artifacts/
  shots/
  generation/
  jobs/
  decisions/
  traces/
  providers/
```

---

## 10. 其他必须补齐的工程模块

### 10.1 Prompt Registry

作用：本地 prompt 版本化、拼接、灰度。

```ts
export interface PromptSpec {
  id: string;
  version: string;
  path: string;
  variablesSchema: z.ZodTypeAny;
}

export function renderPrompt(id: string, variables: unknown): string {
  const spec = PromptRegistry[id];
  const parsed = spec.variablesSchema.parse(variables);
  const template = fs.readFileSync(spec.path, 'utf8');
  return interpolate(template, parsed);
}
```

需要保存：

```txt
promptId
promptVersion
promptHash
renderedPromptPreview
```

---

### 10.2 Artifact Versioning

每次 Agent 输出、用户编辑、Repair Agent 修复都必须产生新版本。

```txt
artifact_id: 逻辑 ID
version: 递增版本
parent_artifact_id: 来源版本
created_by: agent | user | repair-agent | workflow
schema_name
schema_version
data
status: draft | approved | stale | rejected
```

---

### 10.3 Idempotency

所有创建型 API 支持 `Idempotency-Key`。

```txt
POST /image-batches
POST /video-batches
POST /agent-runs
POST /repair
```

幂等键建议由前端生成，也可由后端根据以下字段计算：

```txt
workspaceId + shotId + operation + artifactId + artifactVersion + requestBodyHash
```

---

### 10.4 Provider Boundary

Agent 不直接调用视频 provider。最终视频生成必须由后端使用 approved artifact 确定性编译。

```txt
approved VideoShotScriptArtifact
  -> deterministic compile providerPrompt
  -> create GenerationJob
  -> SeedanceProvider
```

---

### 10.5 Trace / Prompt Preview

每次运行记录：

```txt
traceId
runId
agentName
model
promptId / promptHash
schemaName
inputSummary
outputSummary
validationResult
toolCalls
decisionTreePath
providerCalls
jobId
costEstimate
latencyMs
```

前端 Trace 面板展示：

```txt
当前阶段
使用的模板
prompt preview
模型输出摘要
tool calls
validation errors
repair summary
provider mode
runtime mode
```

---

### 10.6 Safety / Policy Guardrails

至少实现四类：

```txt
Input Guardrail:
  检查用户 prompt 是否包含违规内容、注入、越权 workspaceId。

Output Guardrail:
  检查 Agent 输出是否包含危险建议、非法 claims、空 providerPrompt。

Tool Guardrail:
  检查工具参数、成本上限、workspace 权限。

Business Guardrail:
  检查 artifact 状态机、版本、approve、stale。
```

---

### 10.7 Eval / Test

最低测试集：

```txt
Schema 合法性测试
Prompt snapshot 测试
Tool 参数校验测试
Validation repair 测试
Decision tree path 测试
Decision plan allowlist 测试
Final prompt contract 测试
Provider boundary 测试
Job lifecycle 测试
Trace 字段完整性测试
```

---

## 11. 推荐落地顺序

### P0

```txt
1. AgentRegistry / SchemaRegistry / PromptRegistry
2. MaterialIntake / Brief / Storyboard / ShotPrompt Agent outputType
3. generateAndValidateArtifact 通用函数
4. validation error envelope
5. repair endpoint 最小版
6. deterministic final prompt compiler
7. trace 基础字段
8. tree 模式 nextAction
```

### P1

```txt
1. Tool registry
2. Asset search tool
3. Storyboard image prompt agent
4. Video shot script agent
5. 分镜级 repair
6. 模板选择 decision tree
7. trace/prompt preview 前端面板
8. retry job + fallback provider
```

### P2

```txt
1. DecisionPlannerAgent
2. hybrid decision mode
3. Agent orchestration demo API
4. TraceSummaryAgent
5. A/B 优化建议 Agent
6. 评论驱动二创 Agent
7. Prompt/模板市场原型
```

---

## 12. 最小可用代码骨架

```ts
export async function proposeVideoScript(req: FastifyRequest, reply: FastifyReply) {
  const headers = normalizeAgentHeaders(req.headers);
  const body = ProposeVideoScriptRequestSchema.parse(req.body);

  const context = await buildAgentRunContext({
    workspaceId: req.params.workspaceId,
    userId: req.user.id,
    traceId: headers.traceId,
    runtimeMode: headers.providerMode,
  });

  const payload = await buildVideoScriptAgentPayload({
    workspaceId: req.params.workspaceId,
    shotId: req.params.shotId,
    durationSec: body.durationSec,
    selectedImageId: body.selectedImageId,
    useNeighborFrames: body.useNeighborFrames,
    userInstruction: body.userInstruction,
  });

  const artifactData = await generateAndValidateArtifact<VideoShotScript>({
    agent: videoShotScriptAgent,
    schemaName: 'video-shot-script.v1',
    payload,
    headers,
    context,
  });

  const artifact = await artifactRepo.createVersion({
    workspaceId: req.params.workspaceId,
    shotId: req.params.shotId,
    schemaName: 'video-shot-script.v1',
    data: artifactData,
    createdBy: 'agent',
    traceId: headers.traceId,
  });

  return reply.send({
    ok: true,
    artifact,
    nextAction: 'EDIT_OR_GENERATE_5_VIDEOS',
  });
}
```

---

## 13. 总结

本项目基于 OpenAI Agents SDK 的重点不是“让 Agent 自动做一切”，而是建立一套可控的 AI Runtime：

```txt
Agent 定义清晰
Tool 暴露克制
Schema 强约束
Validation / Repair 标准化
Decision Tree 可解释
Model Decision 受 allowlist 约束
Artifact 全版本化
Job 全异步
Trace 全链路
Final Prompt 确定性编译
```

推荐最终架构：

```txt
P0: Agent + Schema + Artifact + Tree NextAction
P1: Tool Use + Repair + Trace + Template Decision Tree
P2: Hybrid Decision Planner + Agent Orchestration Demo
```
