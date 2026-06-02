输出：
返回一个严格 JSON object，匹配 Ark response_format.json_schema，不要包含 Markdown。
字段名、enum 和 schema key 必须严格使用机器契约中的英文值，例如 targetProvider、durationSec、aspectRatio、providerPrompt、shots.voiceover。
字段值中的自然语言内容必须使用中文构建。
prompt 是全局视频目标和叙事主线，不要重复承载所有逐镜头 providerPrompt。
negativePrompt 是中文负向约束；如没有额外负向要求，可以返回空字符串。
shots[].providerPrompt 是逐镜头中文语境锚点，必须来自已确认分镜和素材绑定；它只承载镜头目标、场景、商品和叙事上下文，不是最终 image prompt，也不是最终 video provider prompt。
shots[].referenceAssetRefs 只能使用已确认素材清单里的 ref。
shots[].shotImage 是静态关键帧字典，必须服务 image-prompt agent。它应包含 scene、composition、lighting、productVisibility、referenceUsage、negative 等静态画面要求；禁止写 camera motion、subject motion、duration、firstFrameIntent、lastFrameIntent、voiceover、transition、剪辑或转场。
shots[].shotVideo 是动态视频运动字典，必须服务 video-script agent。它应包含 cameraMotion、subjectMotion、firstFrameIntent、lastFrameIntent、durationIntent、continuity、negative 等动态要求；必须描述运动、首末帧和连续性，不得只是复述 providerPrompt 或 shotImage。
providerPrompt、shotImage、shotVideo 三层不得互相原样复制；如果信息相同，也要按各自职责重新表述。
tts.voiceover 从 shots[].voiceover 汇总，不新增第二份脚本。
assumptions 只记录必要且可审计的中文假设。
禁止输出占位符值，例如：字符串、string、TODO、N/A、示例、待补充。
