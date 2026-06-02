# AIGC Commerce Video Generation Context

This context defines the business language for the merchant-facing AIGC commerce video generation system.

## Language

**商品素材**:
Media that represents a product's appearance, usage context, selling points, or reference style.
_Avoid_: 单图, raw file

**上传素材**:
A merchant-supplied product media asset accepted by the system for later script and creative generation.
_Avoid_: URL mock

**素材解读**:
A merchant-reviewable creative artifact that classifies uploaded material, identifies the primary product asset, and explains how each accepted material can support later creative generation.
_Avoid_: background preprocessing, hidden scan

**素材标签**:
A role and relevance classification attached to an accepted uploaded material during material interpretation.
_Avoid_: file type, storage metadata

**剧本**:
A structured creative plan containing narrative, visual style, and storyboard shots.
_Avoid_: prompt blob

**创作蓝图**:
A merchant-readable plan that explains the intended video narrative, style, shots, and improvement levers before final generation.
_Avoid_: raw prompt, render instruction

**草稿蓝图**:
A creative blueprint that has not yet been used to start final video generation and can be overwritten.
_Avoid_: version history

**冻结蓝图**:
A creative blueprint that has been used to start final video generation and must remain read-only.
_Avoid_: editable draft

**创作蓝图生成**:
The command that turns uploaded material and creative parameters into a merchant-readable blueprint.
_Avoid_: video generation job

**改进提示**:
A user-facing diagnosis option that points the merchant to structured fields they can adjust after a poor result.
_Avoid_: automatic prompt rewrite

**上游变更提示**:
A warning that downstream creative content was produced from older upstream inputs but remains usable.
_Avoid_: stale, invalid, automatic reset

**待审创作产物**:
A generated creative artifact that the merchant can edit before it becomes an input for downstream generation.
_Avoid_: current runtime input

**生效创作产物**:
An approved creative artifact that serves as the current source for downstream generation.
_Avoid_: latest draft, proposed artifact

**创作审核台**:
The merchant-facing workspace surface where generated creative artifacts are reviewed, edited, and approved before downstream generation.
_Avoid_: debug workbench, raw artifact console

**创作参数**:
Merchant-editable structured inputs that guide script generation without exposing the video prompt.
_Avoid_: raw prompt

**创作要求**:
Merchant-authored creative instructions that guide prompt assembly while the final prompt text remains system-owned.
_Avoid_: raw prompt, system prompt override

**创作会话**:
A working unit centered on one creative-blueprint attempt. It may fail before a blueprint exists, stop after blueprint generation, or continue into one or more final-video jobs.
_Avoid_: provider request, isolated video job

**创作工作目录**:
A registered merchant-owned project folder that scopes product material and creative work for one commerce-video effort.
_Avoid_: thread, random folder, deployment workspace

**创作线路**:
The single current path of work inside a creative workspace, from material intake through blueprint review to final-video attempts.
_Avoid_: version history, multi-branch workflow

**创作会话追踪**:
A shareable audit trail for one creative session that records blueprint generation and any final-video jobs that follow from it.
_Avoid_: provider dashboard only, server console log

**创作动态**:
A merchant-facing notice that translates the current creative review state into the next module the merchant should handle.
_Avoid_: raw trace, provider call, agent run

**模型探测**:
A standalone provider test that calls a text or video model without creating a merchant creative session.
_Avoid_: demo session, generation job

**分镜**:
A script structure unit describing one beat of the final video.
_Avoid_: render segment, clip

**分镜脚本**:
A merchant-reviewable script artifact that organizes final-video beats by business intent, timing, voiceover, and light visual intent.
_Avoid_: storyboard, shot prompt, provider prompt

**卖点证明**:
A storyboard-script beat that explains or demonstrates why the product, service, or offer is worth choosing.
_Avoid_: demo-only shot, technical proof

**分镜链路实例**:
A current or archived set of shot generation work created from an effective shot prompt.
_Avoid_: regenerated script, deleted shot history

**分镜图要求**:
A shot-level creative requirement object that describes the intended key image before image generation.
_Avoid_: raw image prompt, generated image

**分镜图选择**:
The merchant's current chosen key image for one shot, chosen from still-available image candidates.
_Avoid_: stale candidate deletion, image history

**分镜视频要求**:
A shot-level creative requirement object that describes the intended motion, continuity, and video behavior before video generation.
_Avoid_: raw video prompt, generated clip

**分镜视频选择**:
The merchant's current chosen video clip for one shot, chosen from still-available video candidates.
_Avoid_: stale candidate deletion, video history

**分镜生成要求**:
A merchant-reviewable creative artifact that turns approved storyboard shots into per-shot image and video generation requirements before a shot line instance is created.
_Avoid_: shot prompt, raw provider prompt, shot line instance

**成片**:
The final merchant-facing video output produced from product material and a script.
_Avoid_: generated clip

**一键成片**:
A merchant command that turns a generated script and storyboard into a final video in one action.
_Avoid_: black-box full pipeline

**成片任务**:
An asynchronous request that tracks progress from an approved blueprint to a final video.
_Avoid_: blueprint generation

**兜底样例**:
A pre-generated demo output used when live generation is unavailable.
_Avoid_: primary generation path

## Relationships

- A **剧本** contains two to four **分镜**.
- A **分镜脚本** contains one or more **分镜**.
- **创作蓝图生成** produces one **创作蓝图**.
- A **创作蓝图** presents a **剧本**, **分镜**, and adjustment guidance to the merchant.
- A **草稿蓝图** becomes a **冻结蓝图** when **一键成片** creates a **成片任务**.
- Editing a **冻结蓝图** creates a new **草稿蓝图**.
- A **冻结蓝图** can be used by multiple **成片任务** attempts.
- A **创作蓝图** can be used as the recovery anchor for its review and final-video attempts.
- A **改进提示** points to one or more **创作参数** and does not change them automatically.
- An **上游变更提示** informs the merchant that current downstream content may differ if regenerated, without invalidating existing choices.
- A **待审创作产物** becomes a **生效创作产物** only after merchant approval.
- Revising a **生效创作产物** creates a **待审创作产物** before any changed content can become effective again.
- A **创作审核台** exposes **待审创作产物** and **生效创作产物** as merchant-reviewable work, not as raw provider prompt debugging.
- A **创作审核台** starts from **创作要求** and **上传素材** before downstream creative artifacts can be proposed for review.
- **素材解读** applies **素材标签** to accepted **上传素材** and chooses the primary product material for downstream creative work.
- A **素材标签** does not change the uploaded file itself; it describes the file's role and usefulness for creative generation.
- A merchant may edit **素材标签**, inclusion decisions, and the primary product material during **素材解读** review before approving it.
- A **创作审核台** reviews **素材解读** after **创作要求** and **上传素材**, before product positioning and narrative structure.
- A **创作审核台** reviews **分镜脚本** before reviewing per-shot image and video requirements.
- A **分镜脚本** uses merchant-facing business language, while **分镜生成要求** translates it into production-facing image and video requirements.
- **分镜生成要求** is the source plan for a **分镜链路实例**, not the instance itself.
- A **创作审核台** creates the current **分镜链路实例** only after the merchant explicitly applies approved **分镜生成要求**.
- **创作参数** guide **剧本** generation but do not directly expose the video prompt.
- **创作要求** can guide **剧本**, **分镜**, and per-shot image/video generation, but the assembled provider prompt remains internal.
- A **创作工作目录** scopes one or more **创作会话** for a merchant's product-video effort.
- A **创作工作目录** must be recognized by the system before it can resume or advance creative work.
- A **创作工作目录** may have one current **创作线路** for V0+.
- A **创作工作目录** may point to its current **创作线路** and generated outputs, but it does not prove those facts by itself.
- A future **创作工作目录** may contain multiple **创作线路**, but V1 exposes only the current one.
- A **创作会话** may produce one **创作蓝图** and can create zero or more **成片任务**.
- A failed **创作会话** can still have **创作会话追踪** even when no **创作蓝图** was produced.
- **创作会话追踪** belongs to one **创作会话** and may include provider request and response summaries for both **创作蓝图生成** and **成片任务**.
- **创作会话追踪** records machine-readable event kinds; human-readable explanation belongs in event details only when it adds new information.
- **创作动态** highlights the next needed merchant action in a **创作审核台** without exposing raw trace event names.
- A **创作动态** presents one primary next-step notice at a time rather than a full workflow status list.
- A **创作动态** explains non-actionable waiting states by naming the creative module being generated or synchronized.
- A waiting **创作动态** should pair what the system is doing with what the merchant will review or choose next.
- An actionable **创作动态** may include a navigation action, while a waiting **创作动态** should not present a fake action.
- A **创作动态** navigation action takes the merchant to the relevant review module and does not directly approve, generate, apply, or select content.
- A **创作动态** names the business module or task directly and does not use module numbers as explanatory copy.
- A **模型探测** can produce trace logs using a reserved probe identifier, but it is not a **创作会话**.
- **一键成片** happens after a **剧本** and **分镜** are visible to the merchant.
- A **生效创作产物** for shot prompts can create a new **分镜链路实例** only through an explicit apply action.
- A **创作工作目录** has at most one active **分镜链路实例** for the current generation path.
- A **分镜** may carry one **分镜图要求** and one **分镜视频要求** before generation.
- A **分镜** has at most one current **分镜图选择**, while unchosen image candidates can remain available for later selection.
- A **分镜** has at most one current **分镜视频选择**, while unchosen video candidates can remain available for later selection.
- A later **分镜图要求** may depend on the previous **分镜图选择** as its scene-continuity anchor.
- **分镜图选择** should progress in shot order when scene continuity matters.
- A **成片任务** produces at most one current **成片**.
- **分镜视频要求** can be generated in batch after every **分镜图选择** exists, while **分镜视频选择** remains a per-shot merchant review decision.
- A **成片任务** starts only from an explicit merchant command after every required **分镜视频选择** exists.
- A **成片任务** is the recovery anchor for asynchronous final-video progress and result retrieval.
- **上传素材** can be used to create a **剧本** and guide **成片** generation.
- A **兜底样例** can be shown for demo resilience but does not replace the primary **成片任务**.

## Example dialogue

> **Dev:** "If each **分镜** is shown in the UI, do we render one video clip per shot?"
> **Domain expert:** "No. A **分镜** is a script beat; the P0 **成片** is generated as one whole video."

## Flagged ambiguities

- "分镜" was used as both script structure and render segment. Resolved: **分镜** means script structure only in P0/P1.
- "素材上传" was previously represented by a URL mock. Resolved: **上传素材** means merchant-supplied media accepted by the system; storage medium is an implementation detail.
- "一键成片" could mean either the whole workflow or only final video generation. Resolved: in V0, **一键成片** starts after script and storyboard preview.
- "Prompt 调整" could mean raw prompt editing. Resolved: V0 exposes **创作参数** as structured UI fields and does not let users directly edit the video prompt.
- "完全独立组装 prompt" could mean user-owned raw prompt editing. Resolved: users edit **创作要求**, while input/output schema guidance and final prompt assembly remain system-owned.
- "select" could imply deleting or invalidating unchosen candidates. Resolved: **分镜图选择** and **分镜视频选择** are current choices; unchosen candidates remain available.
- "上游修改" could imply downstream reset or invalidation. Resolved: use **上游变更提示**; downstream content remains usable unless the user regenerates it.
- "current artifact" could mean latest proposed content. Resolved: only a **生效创作产物** is current for downstream generation.
- "创作蓝图" could be confused with the internal video prompt. Resolved: **创作蓝图** is user-visible planning content, while the image-to-video prompt remains internal.
- "镜头 Prompt" could expose provider or prompt assembly language to merchants. Resolved: use **分镜生成要求** for the merchant-facing artifact and reserve prompt terminology for internal/provider documentation.
- "改进提示" could imply automatic model rewriting. Resolved: **改进提示** only guides the user to structured fields they manually edit.
- "生成任务" could mean both blueprint generation and video generation. Resolved: V0 uses **创作蓝图生成** for the first command and **成片任务** for the asynchronous video-generation command.
- "重新生成蓝图" could mean always creating versions. Resolved: a **草稿蓝图** is overwritten before video generation; a **冻结蓝图** is read-only and edits create a new version.
- "一键成片" could imply only one attempt per blueprint. Resolved: one **冻结蓝图** can start multiple **成片任务** attempts.
- "session" could mean a browser visit, provider run, or video job. Resolved: use **创作会话** for the blueprint-centered working unit that may include zero or more **成片任务**.
- "thread" could mean an agent conversation or a merchant project folder. Resolved: use **创作工作目录** for the merchant-owned folder and **创作会话** for the creative attempt inside it.
- "workdir state" could imply the local folder is trusted as the source of truth. Resolved: **创作工作目录** can carry recovery pointers, but the system must recognize it before acting on them.
- "scriptId/sessionId" could imply the blueprint identifier also authenticates the local folder. Resolved: a preallocated script identifier can anchor the current **创作线路** and its **创作蓝图**, while **创作工作目录** remains a separate project boundary.
- "trace" could mean only provider dashboard traces or only server console logs. Resolved: use **创作会话追踪** for the app-owned audit trail across blueprint and final-video work.
- "provider test" could imply a real merchant workflow. Resolved: use **模型探测** for standalone provider checks, with reserved probe identifiers rather than real creative-session IDs.
