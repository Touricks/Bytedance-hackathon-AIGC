# AIGC Commerce Video Generation Context

This context defines the business language for the merchant-facing AIGC commerce video generation system.

## Language

**商品素材**:
Media that represents a product's appearance, usage context, selling points, or reference style.
_Avoid_: 单图, raw file

**上传素材**:
A merchant-supplied product media asset accepted by the system for later script and creative generation.
_Avoid_: URL mock

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

**创作参数**:
Merchant-editable structured inputs that guide script generation without exposing the video prompt.
_Avoid_: raw prompt

**创作会话**:
A working unit centered on one creative-blueprint attempt. It may fail before a blueprint exists, stop after blueprint generation, or continue into one or more final-video jobs.
_Avoid_: provider request, isolated video job

**创作会话追踪**:
An audit trail for one creative session that records blueprint generation and any final-video jobs that follow from it.
_Avoid_: provider dashboard only, server console log

**模型探测**:
A standalone provider test that calls a text or video model without creating a merchant creative session.
_Avoid_: demo session, generation job

**分镜**:
A script structure unit describing one beat of the final video.
_Avoid_: render segment, clip

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
- **创作蓝图生成** produces one **创作蓝图**.
- A **创作蓝图** presents a **剧本**, **分镜**, and adjustment guidance to the merchant.
- A **草稿蓝图** becomes a **冻结蓝图** when **一键成片** creates a **成片任务**.
- Editing a **冻结蓝图** creates a new **草稿蓝图**.
- A **冻结蓝图** can be used by multiple **成片任务** attempts.
- A **改进提示** points to one or more **创作参数** and does not change them automatically.
- **创作参数** guide **剧本** generation but do not directly expose the video prompt.
- A **创作会话** may produce one **创作蓝图** and can create zero or more **成片任务**.
- A failed **创作会话** can still have **创作会话追踪** even when no **创作蓝图** was produced.
- **创作会话追踪** belongs to one **创作会话** and may include provider request and response summaries for both **创作蓝图生成** and **成片任务**.
- A **模型探测** can produce trace logs using a reserved probe identifier, but it is not a **创作会话**.
- **一键成片** happens after a **剧本** and **分镜** are visible to the merchant.
- A **成片任务** produces at most one current **成片**.
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
- "创作蓝图" could be confused with the internal video prompt. Resolved: **创作蓝图** is user-visible planning content, while the image-to-video prompt remains internal.
- "改进提示" could imply automatic model rewriting. Resolved: **改进提示** only guides the user to structured fields they manually edit.
- "生成任务" could mean both blueprint generation and video generation. Resolved: V0 uses **创作蓝图生成** for the first command and **成片任务** for the asynchronous video-generation command.
- "重新生成蓝图" could mean always creating versions. Resolved: a **草稿蓝图** is overwritten before video generation; a **冻结蓝图** is read-only and edits create a new version.
- "一键成片" could imply only one attempt per blueprint. Resolved: one **冻结蓝图** can start multiple **成片任务** attempts.
- "session" could mean a browser visit, provider run, or video job. Resolved: use **创作会话** for the blueprint-centered working unit that may include zero or more **成片任务**.
- "trace" could mean only provider dashboard traces or only server console logs. Resolved: use **创作会话追踪** for the app-owned audit trail across blueprint and final-video work.
- "provider test" could imply a real merchant workflow. Resolved: use **模型探测** for standalone provider checks, with reserved probe identifiers rather than real creative-session IDs.
