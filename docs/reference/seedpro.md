POST https://ark.cn-beijing.volces.com/api/v3/chat/completions   运行
发送包含文本、图片、视频、音频等模态的消息列表，模型将生成对话中的下一条消息。
Tips：一键展开折叠，快速检索内容
说明
打开页面右上角开关后，ctrl + f 可检索页面内所有内容。

在线调试
快速入口

API Explorer
您可以通过 API Explorer 在线发起调用，无需关注签名生成过程，快速获取调用结果。
去调试

请求参数
跳转 响应参数
请求体

model string 必选
调用的模型 ID （Model ID），开通模型服务，并查询 Model ID 。
多个应用及精细管理场景，推荐使用 Endpoint ID 调用。详细请参考 获取 Endpoint ID。

messages  object[] 必选
消息列表，不同模型支持不同类型的消息，如文本、图片、视频、音频等。
消息类型

系统消息 object
模型需遵循的指令，包括扮演的角色、背景信息等。
属性

用户消息 object 
用户角色发送的消息。不同模型支持的字段类型不同。
属性

模型消息 object
历史对话中，模型角色返回的消息。用以保持对话一致性，多在多轮对话及续写模式使用。
属性

工具消息 object
历史对话中，调用工具返回的消息。工具调用场景中使用。
属性

thinking object 默认值 {"type":"enabled"}
控制模型是否开启深度思考模式。
不同模型是否支持以及默认取值不同，详情请查询文档。
属性

thinking.type string  必选
取值范围：enabled， disabled，auto。
enabled：开启思考模式，模型强制先思考再回答。
disabled：关闭思考模式，模型直接回答问题，不进行思考。
auto：自动思考模式，模型根据问题自主判断是否需要思考，简单题目直接回答。

stream boolean / null 默认值 false
响应内容是否流式返回：
false：模型生成完所有内容后一次性返回结果。
true：按 SSE 协议逐块返回模型生成内容，并以一条 data: [DONE] 消息结束。当 stream 为 true 时，可设置 stream_options 字段以获取 token 用量统计信息。

stream_options object / null 默认值 null
流式响应的选项。当 stream 为 true 时，可设置 stream_options 字段。
属性

stream_options.include_usage boolean / null 默认值 false
模型流式输出时，是否在输出结束前输出本次请求的 token 用量信息。
true：在 data: [DONE] 消息之前会返回一个额外的 chunk。此 chunk 中， usage 字段中输出整个请求的 token 用量，choices 字段为空数组。
false：输出结束前，没有一个 chunk 来返回 token 用量信息。

stream_options.chunk_include_usage boolean / null 默认值 false
模型流式输出时，输出的每个 chunk 中是否输出本次请求到此 chunk 输出时刻的累计 token 用量信息。
true：在返回的 usage 字段中，输出本次请求到此 chunk 输出时刻的累计 token 用量。
false：不在每个 chunk 都返回 token 用量信息。

max_tokens integer / null 默认值 4096
取值范围：各个模型不同，详细见模型列表。
模型回答最大长度（单位 token）。
说明
模型回答不包含思维链内容，模型回答 = 模型输出 - 模型思维链（如有）
输出 token 的总长度还受模型的上下文长度限制。

max_completion_tokens integer / null 
支持该字段的模型及使用说明见 文档。
取值范围：[1, 65,536]。
控制模型输出的最大长度（包括模型回答和模型思维链内容长度，单位 token）。
配置了该参数后，可以让模型输出超长内容，max_tokens 默认值失效，模型按需输出内容（回答和思维链），直到达到 max_completion_tokens 值。
不可与 max_tokens 字段同时设置。

service_tier string / null 默认值 auto
控制使用的在线推理模式。取值范围：fast、auto、default。
fast：本次请求优先使用 在线推理（低延迟）模式。
推理接入点（model 字段指定）有低延迟限流配额，本次请求将会优先使用低延迟限流配额，获得更高的服务等级（延迟、可用性等）。
推理接入点（model 字段指定）无低延迟限流配额，或者限流配额已满，降级至在线推理（常规）模式，维持常规的服务等级。
auto：本次请求优先使用 在线推理（TPM保障包）模式。
推理接入点（model 字段指定） 有 TPM 保障包额度，本次请求将会优先使用 TPM 保障包额度，获得最高的服务等级（延迟、可用性等）。
推理接入点（model 字段指定） 无 TPM 保障包额度或用超额度，降级至在线推理（常规）模式，维持常规的服务等级。
default：本次请求只使用 在线推理（常规）模式。维持常规的服务等级，即使调用的推理接入点有TPM保障包额度 / 低延迟限流额度。

stop string / string[] / null 默认值 null
模型遇到 stop 字段所指定的字符串时将停止继续生成，这个词语本身不会输出。最多支持 4 个字符串。
深度思考能力模型不支持该字段。
["你好", "天气"]

reasoning_effort string / null 默认值 medium
支持该字段的模型、与 thinking.type 字段关系见文档。
限制思考的工作量。减少思考深度可提升速度，思考花费的 token 更少。
取值范围：minimal，low，medium，high，max（仅部分模型支持）。
minimal：关闭思考，直接回答。
low：轻量思考，侧重快速响应。
medium：均衡模式，兼顾速度与深度。
high：深度分析，处理复杂问题。
max：最高程度思考，适配高难度推理任务。该参数仅对指定模型生效，非适配模型传入将不生效。 支持模型列表： 
deepseek-v4-pro-260425
deepseek-v4-flash-260425

response_format object  默认值 {"type": "text"} beta阶段
指定模型回答格式。
回答格式说明

文本格式 object
模型默认回复文本格式内容。
属性

JSON Object 格式 object
模型回复内容以JSON对象结构来组织。
支持该字段的模型请参见文档。
该能力尚在 beta 阶段，请谨慎在生产环境使用。
属性

JSON Schema 格式 object  
模型回复内容以JSON对象结构来组织，遵循 schema 字段定义的JSON结构。
支持该字段的模型请参见文档。
该能力尚在 beta 阶段，请谨慎在生产环境使用。
属性

response_format.type string 必选
此处应为json_schema。

response_format.json_schema object 必选
JSON结构体的定义。
属性

response_format.json_schema.name string 必选
用户自定义的JSON结构的名称。

response_format.json_schema.description string / null 
回复用途描述，模型将根据此描述决定如何以该格式回复。

response_format.json_schema.schema object 必选
回复格式的 JSON 格式定义，以 JSON Schema 对象的形式描述。

response_format.json_schema.strict boolean / null 默认值 false
是否在生成输出时，启用严格遵循模式。
true：模型将始终严格遵循schema字段中定义的格式。
false：模型会尽可能遵循schema字段中定义的结构。

frequency_penalty float / null 默认值 0
取值范围为 [-2.0, 2.0]。
注意
doubao-seed-1.8、doubao-seed-2.0系列模型不支持该字段。
频率惩罚系数。如值为正，根据新 token 在文本中的出现频率对其进行惩罚，从而降低模型逐字重复的可能性。

presence_penalty float / null 默认值 0
取值范围为 [-2.0, 2.0]。
注意
doubao-seed-1.8、doubao-seed-2.0系列模型不支持该字段。
存在惩罚系数。如果值为正，会根据新 token 到目前为止是否出现在文本中对其进行惩罚，从而增加模型谈论新主题的可能性。

temperature float / null 默认值 1
取值范围为 [0, 2]。
注意
当调用下列模型，字段取值固定为 1，手动指定的参数值将被忽略。
doubao-seed-2-0-pro-260215
doubao-seed-2-0-lite-260215
采样温度。控制了生成文本时对每个候选词的概率分布进行平滑的程度。当取值为 0 时模型仅考虑对数概率最大的一个 token。
较高的值（如 0.8）会使输出更加随机，而较低的值（如 0.2）会使输出更加集中确定。
通常建议仅调整 temperature 或 top_p 其中之一，不建议两者都修改。

top_p float / null 默认值 0.7
取值范围为 [0, 1]。
注意
当调用下列模型，字段取值固定为 0.95，手动指定的参数值将被忽略。
doubao-seed-2-0-pro-260215
doubao-seed-2-0-lite-260215
doubao-seed-1-8-251228
核采样概率阈值。模型会考虑概率质量在 top_p 内的 token 结果。当取值为 0 时模型仅考虑对数概率最大的一个 token。
0.1 意味着只考虑概率质量最高的前 10% 的 token，取值越大生成的随机性越高，取值越低生成的确定性越高。通常建议仅调整 temperature 或 top_p 其中之一，不建议两者都修改。

logprobs boolean / null 默认值 false
带深度思考能力模型不支持该字段，深度思考能力模型参见文档。
是否返回输出 tokens 的对数概率。
false：不返回对数概率信息。
true：返回消息内容中每个输出 token 的对数概率。

top_logprobs integer / null 默认值 0
带深度思考能力模型不支持该字段，深度思考能力模型参见文档。
取值范围为 [0, 20]。
指定每个输出 token 位置最有可能返回的 token 数量，每个 token 都有关联的对数概率。仅当 logprobs为true 时可以设置 top_logprobs 参数。

logit_bias map / null 默认值 null
带深度思考能力模型不支持该字段，深度思考能力模型参见文档。
调整指定 token 在模型输出内容中出现的概率，使模型生成的内容更加符合特定的偏好。logit_bias 字段接受一个 map 值，其中每个键为词表中的 token ID（使用 tokenization 接口获取），每个值为该 token 的偏差值，取值范围为 [-100, 100]。
-1 会减少选择的可能性，1 会增加选择的可能性；-100 会完全禁止选择该 token，100 会导致仅可选择该 token。该参数的实际效果可能因模型而异。
{"<Token_ID>": -100}

tools object[] / null 默认值 null
待调用工具的列表，模型返回信息中可包含。当您需要让模型返回待调用工具时，需要配置该结构体。支持该字段的模型请参见文档。
属性

parallel_tool_calls boolean 默认值 true
本次请求，模型返回是否允许包含多个待调用的工具。
true：允许返回多个待调用的工具。
false：允许返回的待调用的工具小于等于1，本取值在 doubao-seed-1.6 及之后系列模型生效。

tool_choice string / object
仅 doubao-seed-1.6 及之后系列模型支持此字段。
本次请求，模型返回信息中是否有待调用的工具。
当没有指定工具时，none 是默认值。如果存在工具，则 auto 是默认值。
可选类型

响应参数
跳转 请求参数
非流式调用返回
跳转 流式调用返回

id string
本次请求的唯一标识。

model string
本次请求实际使用的模型名称和版本。

service_tier string
本次请求的请求使用的模式。
scale：本次请求使用 在线推理（TPM保障包）模式。
default：本次请求使用 在线推理（常规）模式。
fast：本次请求使用 在线推理（低延迟）模式。

created integer
本次请求创建时间的 Unix 时间戳（秒）。

object string
固定为 chat.completion。

choices object[]
本次请求的模型输出内容。
属性

usage object
本次请求的 token 用量。
属性

usage.total_tokens integer
本次请求消耗的总 token 数量（输入 + 输出）。

usage.prompt_tokens integer
输入给模型处理的内容 token 数量。

usage.prompt_tokens_details object
输入给模型处理的内容 token 数量的细节。
属性

usage.prompt_tokens_details.cached_tokens integer
缓存输入内容的 token 用量，此处应为 0。

usage.prompt_tokens_details.audio_tokens integer
音频输入内容所消耗的 token 数量。

usage.prompt_tokens_details.audio_cached_tokens integer
缓存音频输入内容的 token 用量。

usage.completion_tokens integer
模型输出内容花费的 token。

usage.completion_tokens_details object
模型输出内容花费的 token 的细节。
属性

流式调用返回
跳转 非流式调用返回

id string
本次请求的唯一标识。

model string
本次请求实际使用的模型名称和版本。

service_tier string
本次请求是否使用了TPM保障包。
scale：本次请求使用 在线推理（TPM保障包）模式。
default：本次请求使用 在线推理（常规）模式。
fast：本次请求使用 在线推理（低延迟）模式。

created integer
本次请求创建时间的 Unix 时间戳（秒）。

object string
固定为 chat.completion.chunk。

choices object[]
本次请求的模型输出内容。
属性

usage object
本次请求的 token 用量。
流式调用时，默认不统计 token 用量信息，返回值为null。
如需统计，需设置 stream_options.include_usage为true。
属性

usage.total_tokens integer
本次请求消耗的总 token 数量（输入 + 输出）。

usage.prompt_tokens integer
输入给模型处理的内容 token 数量。

usage.prompt_tokens_details object
输入给模型处理的内容 token 数量的细节。
属性

usage.prompt_tokens_details.cached_tokens integer
缓存输入内容的 token 用量，此处应为 0。

usage.prompt_tokens_details.audio_tokens integer
音频输入内容所消耗的 token 数量。

usage.prompt_tokens_details.audio_cached_tokens integer
缓存音频输入内容的 token 用量。

usage.completion_tokens integer
模型输出内容花费的 token。

usage.completion_tokens_details object
模型输出内容花费的 token 的细节。
属性

