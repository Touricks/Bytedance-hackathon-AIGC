部分大模型具备图片视觉理解能力，支持本地文件和图片 URL 方式传入图片，适用于图片描述、分类、视觉定位等场景。
说明
方舟平台的新用户？获取 API Key 及 开通模型等准备工作，请参见 快速入门。
快速开始
通过图片 URL 方式传入模型快速体验图片理解效果，Responses API 示例代码如下。

输入

输出预览

支持输入图片的模型系列是哪个？

思考：用户现在需要找支持输入图片的模型系列，看表格里的输入列中的图片那一行。表格里模型系列Doubao-Seed-1.8对应的输入图片列是√，其他DeepSeek-V3.2和GLM-4.7对应的输入图片都是×，所以答案应该是Doubao-Seed-1.8。
回答：支持输入图片的模型系列是Doubao-Seed-1.8。

Curl
Python
Go
Java
OpenAI SDK

Bash
复制
curl https://ark.cn-beijing.volces.com/api/v3/responses \
-H "Authorization: Bearer $ARK_API_KEY" \
-H 'Content-Type: application/json' \
-d '{
    "model": "doubao-seed-2-0-lite-260215",
    "input": [
        {
            "role": "user",
            "content": [
                {
                    "type": "input_image",
                    "image_url": "https://ark-project.tos-cn-beijing.volces.com/doc_image/ark_demo_img_1.png"
                },
                {
                    "type": "input_text",
                    "text": "支持输入图片的模型系列是哪个？"
                }
            ]
        }
    ]
}'

模型与API
支持的模型：
请参见视觉理解能力。
支持的 API：
Responses API：支持图片作为输入进行分析。支持文件路径上传进行图片理解，使用方式参见文件路径上传（推荐）。
Chat API：支持图片作为输入进行分析。
图片传入方式
支持的图片传入方式如下：
本地文件上传：
文件路径上传（推荐）：直接传入本地文件路径，文件大小不能超过 512 MB。
Base64 编码传入：适用于图片文件体积较小的场景，单张图片小于 10 MB，请求体不能超过 64 MB。
图片 URL 传入：适用于图片文件已存在公网可访问 URL 的场景，单张图片小于 10 MB。
说明
Chat API 是无状态的，如需模型对同一张图片进行多轮理解，则每次请求时都需传入该图片信息。
本地文件上传
文件路径上传（推荐）
建议优先采用文件路径方式上传本地文件，该方式可以支持最大 512MB 文件的处理。（当前 Responses API 支持该方式）
直接向模型传入本地文件路径，会自动调用 Files API 完成文件上传，再调用 Responses API 进行图片分析。仅 Python SDK 和 Go SDK 支持该方式。具体示例如下：
如果需要实时获取分析内容，或者要规避复杂任务引发的客户端超时失败问题，可采用流式输出的方式，使用方式可参见示例代码。
支持直接使用 Files API 上传本地文件，具体请参见文件输入(File API)。

Python
Go

Python
复制
import asyncio
import os
from volcenginesdkarkruntime import AsyncArk

client = AsyncArk(
    base_url='https://ark.cn-beijing.volces.com/api/v3',
    api_key=os.getenv('ARK_API_KEY')
)
async def main():
    local_path = "/Users/doc/ark_demo_img_1.png"
    response = await client.responses.create(
        model="doubao-seed-2-0-lite-260215",
        input=[
            {"role": "user", "content": [
                {
                    "type": "input_image",
                    "image_url": f"file://{local_path}"  
                },
                {
                    "type": "input_text",
                    "text": "Which model series supports image input?"
                }
            ]},
        ]
    )
    print(response)
if __name__ == "__main__":
    asyncio.run(main())

Base64 编码传入
将本地文件转换为 Base64 编码字符串，然后提交给大模型。该方式适用于图片文件体积较小的情况，单张图片小于 10 MB，请求体不能超过 64MB。（Responses API 和 Chat API 都支持该方式。）
注意
将图片文件转换为Base64编码字符串，然后遵循data:{mime_type};base64,{base64_data}格式拼接，传入模型。
{mime_type}：文件的媒体类型，需要与文件格式mime_type对应。支持的图片格式详细见图片格式说明。
{base64_data}：文件经过Base64编码后的字符串。

Chat API

Responses API

Python
复制
...
model="doubao-seed-2-0-lite-260215",
messages=[
    {
        "role": "user",
        "content": [
            {
                "type": "image_url",
                "image_url": {
                    "url": f"data:image/png;base64,{base64_image}"
                }
            },
            {
                "type": "text",
                "text": "Which model series supports image input?"
            }
        ]
    }
]
...

Python
复制
...
model="doubao-seed-2-0-lite-260215",
input=[
    {
        "role": "user",
        "content": [
            {
                "type": "input_image",
                "image_url": f"data:image/png;base64,{base64_image}"
            },
            {
                "type": "input_text",
                "text": "Which model series supports image input?"
            }
        ]
    }
]
...

Responses API 示例代码：

Curl
Python
Go
Java
OpenAI SDK

Bash
复制
BASE64_IMAGE=$(base64 < demo.png) && curl https://ark.cn-beijing.volces.com/api/v3/responses \
   -H "Content-Type: application/json"  \
   -H "Authorization: Bearer $ARK_API_KEY"  \
   -d @- <<EOF
   {
    "model": "doubao-seed-2-0-lite-260215",
    "input": [
      {
        "role": "user",
        "content": [
          {
            "type": "input_image",
            "image_url": "data:image/png;base64,$BASE64_IMAGE"
          },
          {
            "type": "input_text",
            "text": "Which model series supports image input?"
          }
        ]
      }
    ]
  }
EOF

Chat API 示例代码：

Curl
Python
Go
Java

Bash
复制
BASE64_IMAGE=$(base64 < demo.png) && curl https://ark.cn-beijing.volces.com/api/v3/chat/completions \
   -H "Content-Type: application/json"  \
   -H "Authorization: Bearer $ARK_API_KEY"  \
   -d @- <<EOF
   {
    "model": "doubao-seed-2-0-lite-260215",
    "messages": [
      {
        "role": "user",
        "content": [
          {
            "type": "image_url",
            "image_url": {
              "url": "data:image/png;base64,$BASE64_IMAGE"
            }
          },
          {
            "type": "text",
            "text": "Which model series supports image input?"
          }
        ]
      }
    ],
    "max_tokens": 300
  }
EOF

图片 URL 传入
如果图片已存在公网可访问URL，可以在请求中直接填入图片的公网URL，单张图片不能超过 10 MB。（Responses API 和 Chat API 都支持该方式。）
说明
如果使用 URL，建议使用火山引擎TOS（对象存储）存储图片并生成访问链接，不仅能保证图片的稳定存储，还能利用方舟与TOS的内网通信优势，有效降低模型回复的时延和公网流量费用。

Chat API

Responses API

Python
复制
...
model="doubao-seed-2-0-lite-260215",
messages=[
    {
        "role": "user",
        "content": [
            {
                "type": "image_url",
                "image_url": {
                    "url": "https://ark-project.tos-cn-beijing.volces.com/doc_image/ark_demo_img_1.png"
                }
            },
            {
                "type": "text",
                "text": "Which model series supports image input?"
            }
        ]
    }
]
...

Python
复制
...
model="doubao-seed-2-0-lite-260215",
input=[
    {
        "role": "user",
        "content": [
            {
                "type": "input_image",
                "image_url": "https://ark-project.tos-cn-beijing.volces.com/doc_image/ark_demo_img_1.png"
            },
            {
                "type": "input_text",
                "text": "Which model series supports image input?"
            }
        ]
    }
]
...

Responses API 示例代码：快速开始
Chat API 示例代码：

Curl
Python
Go
Java

Bash
复制
curl https://ark.cn-beijing.volces.com/api/v3/chat/completions \
   -H "Content-Type: application/json" \
   -H "Authorization: Bearer $ARK_API_KEY" \
   -d '{
    "model": "doubao-seed-2-0-lite-260215",
    "messages": [
        {
            "role": "user",
            "content": [                
                {"type": "image_url","image_url": {"url": "https://ark-project.tos-cn-beijing.volces.com/doc_image/ark_demo_img_1.png"}},
                {"type": "text", "text": "Which model series supports image input?"}
            ]
        }
    ],
    "max_tokens": 300
  }'

使用场景
多图输入
API 可支持接受和处理多个图像输入，这些图像可通过图片可访问 URL 或图片转为 Base64 编码后输入，模型将结合所有传入的图像中的信息来回答问题。
Responses API 示例代码：

Curl
Python
Go
Java

Bash
复制
curl https://ark.cn-beijing.volces.com/api/v3/responses \
  -H "Authorization: Bearer $ARK_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "doubao-seed-2-0-lite-260215",
    "input": [
        {
            "role": "user",
            "content": [
                {
                    "type": "input_image",
                    "image_url": "https://ark-project.tos-cn-beijing.volces.com/doc_image/ark_demo_img_1.png"
                },
                {
                    "type": "input_image",
                    "image_url": "https://ark-project.tos-cn-beijing.volces.com/doc_image/ark_demo_img_2.png"
                },
                {
                    "type": "input_text",
                    "text": "支持输入图片的模型系列是哪个？同时，豆包应用场景有哪些？"
                }
            ]
        }
    ]
  }'

Chat API 示例代码：

Curl
Python
Go
Java

Bash
复制
curl https://ark.cn-beijing.volces.com/api/v3/chat/completions \
   -H "Content-Type: application/json"  \
   -H "Authorization: Bearer $ARK_API_KEY"  \
   -d '{
    "model": "doubao-seed-2-0-lite-260215",
    "messages": [
        {
            "role": "user",
            "content": [                
                {"type": "image_url","image_url": {"url": "https://ark-project.tos-cn-beijing.volces.com/doc_image/ark_demo_img_1.png"}},
                {"type": "image_url","image_url": {"url": "https://ark-project.tos-cn-beijing.volces.com/doc_image/ark_demo_img_2.png"}},
                {"type": "text", "text": "支持输入图片的模型系列是哪个？同时，豆包应用场景有哪些？"}
            ]
        }
    ],
    "max_tokens": 300
  }'

控制图片理解的精细度
控制图片理解的精细度（指对画面的精细）： image_pixel_limit 、detail 字段，2个字段若同时配置，则生效逻辑如下：
生效前提：图片像素范围在 [196, 36,000,000] px，否则直接报错。
生效优先级：image_pixel_limit 高于 detail 字段，即同时配置 detail 与 image_pixel_limit 字段时，生效 image_pixel_limit 字段配置。
缺省时生效：image_pixel_limit 字段的 min_pixels / max_pixels 字段未设置，则使用 detail 默认值配置所对应的值。具体范围参见通过 detail 字段（图片理解）。
下面分别介绍如何通过 detail 、 image_pixel_limit 控制视觉理解的精度。
通过 detail 字段（图片理解）
通过detail参数来控制模型理解图片的精细度， 不同模型支持的 detail 模式、token 用量、图片像素区间如下：
说明
doubao-seed-2.0 模型 detail 默认值为 high，单图固定 1280 个 tokens，在不牺牲效果的同时消耗的 tokens 更少。

detail模式

doubao-seed-1.8 之前的模型
detail 默认值为low

doubao-seed-1.8 模型
detail 默认值为 high

doubao-seed-2.0 模型
detail 默认值为 high

单图token范围

图片像素区间

单图token范围

图片像素区间

单图token范围

图片像素区间

low

[4, 1312]

[3136, 1048576]

[1, 1213]

[1764, 2139732]

[1, 1280]

[1764, 2257920]

high

[4, 5120]

[3136, 4014080]

[1, 5120]

[1764, 9031680]

1280

2257920

xhigh

-

-

-

-

[1280, 5120]

[2257920, 9031680]

detail 为 low 时，图片处理速度会提高，适合图片本身细节较少或者只需模型理解图片大致信息或者对速度有要求的场景。
detail 为 high 或 xhigh 时，模型可感知图片更多的细节，但是图片处理速度会降低，适合图像像素值高且需关注细节信息的场景，如街道地图分析等。
图片缩放规则：不在指定模式对应的图片像素区间时，方舟会等比例缩放至范围内。
Responses API 示例代码：

Curl
Python
Go
Java

Bash
复制
curl https://ark.cn-beijing.volces.com/api/v3/responses \
-H "Authorization: Bearer $ARK_API_KEY" \
-H 'Content-Type: application/json' \
-d '{
    "model": "doubao-seed-2-0-lite-260215",
    "input": [
        {
            "role": "user",
            "content": [
                {
                    "type": "input_image",
                    "image_url": "https://ark-project.tos-cn-beijing.volces.com/doc_image/ark_demo_img_1.png",
                    "detail": "high"
                },
                {
                    "type": "input_text",
                    "text": "Which model series supports image input?"
                }
            ]
        }
    ]
}'

Chat API 示例代码：

Curl
Python
Go
Java

Bash
复制
curl https://ark.cn-beijing.volces.com/api/v3/chat/completions \
   -H "Content-Type: application/json" \
   -H "Authorization: Bearer $ARK_API_KEY" \
   -d '{
    "model": "doubao-seed-2-0-lite-260215",
    "messages": [
        {
            "role": "user",
            "content": [                
                {"type": "image_url","image_url": {"url": "https://ark-project.tos-cn-beijing.volces.com/doc_image/ark_demo_img_1.png","detail": "high"}},
                {"type": "text", "text": "Which model series supports image input?"}
            ]
        }
    ]
  }'

通过 image_pixel_limit 结构体
控制传入给方舟的图像像素大小范围，如果不在此范围，则会等比例放大或者缩小至该范围内，后传给模型进行理解。你可通过 image_pixel_limit 结构体，精细控制模型可理解的图片像素多少。
对应结构体如下：

Bash
复制
"image_pixel_limit": {
    "max_pixels": 3014080,   # 图片最大像素
    "min_pixels": 3136       # 图片最小像素
}

示例代码如下：
Java SDK、 Go SDK 不支持此字段。
Responses API 示例代码：

Curl
Python

Bash
复制
curl https://ark.cn-beijing.volces.com/api/v3/responses \
-H "Authorization: Bearer $ARK_API_KEY" \
-H 'Content-Type: application/json' \
-d '{
    "model": "doubao-seed-2-0-lite-260215",
    "input": [
        {
            "role": "user",
            "content": [
                {
                    "type": "input_image",
                    "image_url": "https://ark-project.tos-cn-beijing.volces.com/doc_image/ark_demo_img_1.png",
                    "image_pixel_limit":  {
                        "max_pixels": 3014080,
                        "min_pixels": 3136
                     }
                },
                {
                    "type": "input_text",
                    "text": "Which model series supports image input?"
                }
            ]
        }
    ]
}'

Chat API 示例代码：

Curl
Python

Bash
复制
curl https://ark.cn-beijing.volces.com/api/v3/chat/completions \
   -H "Content-Type: application/json" \
   -H "Authorization: Bearer $ARK_API_KEY" \
   -d '{
    "model": "doubao-seed-2-0-lite-260215",
    "messages": [
        {
            "role": "user",
            "content": [                
                {"type": "image_url","image_url": {"url": "https://ark-project.tos-cn-beijing.volces.com/doc_image/ark_demo_img_1.png","image_pixel_limit": {"max_pixels": 3014080,"min_pixels": 3136}}},
                {"type": "text", "text": "Which model series supports image input?"}
            ]
        }
    ],
    "max_tokens": 300
  }'

图文混排
支持灵活地传入提示词和图片信息的方式，你可任意调整传入图片和文本的顺序，以及在system message或者User message传入图文信息。模型会根据顺序返回处理信息的结果，示例如下。
说明
图文混排场景，图文顺序可能影响模型输出效果，若结果不符预期，可调整顺序。当多图+一段文字时，建议将文字放在图片之后。
Responses API 示例代码：

Curl
Python
Go
Java

Bash
复制
curl https://ark.cn-beijing.volces.com/api/v3/responses \
-H "Authorization: Bearer $ARK_API_KEY" \
-H 'Content-Type: application/json' \
-d '{
    "model": "doubao-seed-2-0-lite-260215",
    "input": [
        {
            "role": "system",
            "content": [
                {
                    "type": "input_text",
                    "text": "下面人物是目标人物"
                },
                {
                    "type": "input_image",
                    "image_url": "https://ark-project.tos-cn-beijing.volces.com/doc_image/target.png"
                },
                {
                    "type": "input_text",
                    "text": "请确认下面图片中是否含有目标人物"
                }
            ]
        },
        {
            "role": "user",
            "content": [
                {
                    "type": "input_text",
                    "text": "图片1中是否含有目标人物"
                },
                {
                    "type": "input_image",
                    "image_url": "https://ark-project.tos-cn-beijing.volces.com/doc_image/scene_01.png"
                },
                {
                    "type": "input_text",
                    "text": "图片2中是否含有目标人物"
                },
                {
                    "type": "input_image",
                    "image_url": "https://ark-project.tos-cn-beijing.volces.com/doc_image/scene_02.png"
                }
            ]
        }
    ]
}'

Chat API 示例代码：

Curl
Python
Go
Java

Bash
复制
curl https://ark.cn-beijing.volces.com/api/v3/chat/completions \
   -H "Content-Type: application/json" \
   -H "Authorization: Bearer $ARK_API_KEY" \
   -d '{
    "model": "doubao-seed-2-0-lite-260215",
    "messages": [
        {
            "role": "system",
            "content": [
                {"type": "text", "text": "下面人物是目标人物"},
                {
                    "type": "image_url",
                    "image_url": {
                        "url": "https://ark-project.tos-cn-beijing.volces.com/doc_image/target.png"
                    }
                },
                {"type": "text", "text": "请确认下面图片中是否含有目标人物"}
            ]
        },
        {
            "role": "user",
            "content": [
                {"type": "text", "text": "图片1中是否含有目标人物"},
                {
                    "type": "image_url",
                    "image_url": {
                        "url": "https://ark-project.tos-cn-beijing.volces.com/doc_image/scene_01.png"
                    }
                },
                {"type": "text", "text": "图片2中是否含有目标人物"},
                {
                    "type": "image_url",
                    "image_url": {
                        "url": "https://ark-project.tos-cn-beijing.volces.com/doc_image/scene_02.png"
                    }
                }
            ]
        }
    ],
    "max_tokens": 300
  }'

视觉定位（Visual Grounding）
请参见教程 视觉定位 Grounding。
GUI任务处理
请参见教程 GUI 任务处理。
使用说明
说明
处理完图片/视频后，文件会从方舟服务器删除。方舟不会保留你提交的图片、视频以及文本信息等用户数据来训练模型。
图片像素说明
传入图片像素要求如下，超出限制后会直接报错。
宽 > 14px 且高 > 14px
宽*高范围：[196px, 36000000px]
宽高比范围：[1/150, 150]
图片预处理：
根据使用的模型、设置的 detail 模式，将图片等比例缩放至相应的范围（具体见通过 detail 字段（图片理解）），可降低模型响应时延及 token 消耗。
图片 token 用量说明
根据图片宽高像素计算得到 token 用量。不同模型的图片 token 用量估算逻辑如下。单图 token 范围参见通过 detail 字段（图片理解）。

doubao-seed-1.8 之前的模型

doubao-seed-1.8 模型、doubao-seed-2.0 模型

JSON
复制
min(image_width * image_hight ÷ 784, max_image_tokens)

JSON
复制
min(image_width * image_hight ÷ 1764, max_image_tokens)

以传入模型的单图 token 最大值为 1312 为例，计算图片消耗的 token 数的逻辑如下：
图片尺寸为 1280 px × 720 px：理解这张图消耗的 token 为1280×720÷784=1176，该值小于 1312，根据公式计算消耗 token 数为 1176。
图片尺寸为 1920 px × 1080 px：理解这张图消耗的 token 为1920×1080÷784=2645，该值大于 1312，根据公式计算消耗 token 数为 1312。
这种情况会对图片进行压缩，即图片会丢失部分细节。譬如字体很小的图片，模型可能会无法识别文字内容。
图片数量说明
单次请求传入图片数量受限于模型上下文窗口。当输入过长，触发模型上下文窗口，信息会被截断。
模型上下文窗口请参见模型列表。
举例说明：
当图片总像素值大，使用的模型上下文窗口为 32k token，每张图片转为 1312 token ，单次请求可传入的图片数量为 32000 ÷ 1312 = 24张。
当图片总像素值小，使用的模型上下文窗口为 32k token，每张图片转为 256 token，单次请求可传入的数量为 32000 ÷ 256 = 125 张。
说明
模型回复的质量，受输入图片信息量影响。过多的图片会导致模型回复质量下滑，请合理控制单次请求传入图片的数量。
图片文件容量
使用 URL 方式传入图片，单张图片不能超过 10MB。
使用 Base64 编码传入图片，单张图片不能超过 10MB，请求体不能超过 64MB。
使用文件路径传入图片，图片不能超过 512 MB。
图片格式说明
支持的图片格式如下表，注意文件后缀匹配图片格式，即图片文件扩展名（URL传入时）、图片格式声明（Base64 编码传入时）需与图片实际信息一致。

图片格式

文件扩展名

内容格式 Content Type

JPEG

.jpg, .jpeg

image/jpeg

PNG

.png

image/png

GIF

.gif

image/gif

WEBP

.webp

image/webp

BMP

.bmp

image/bmp

TIFF

.tiff, .tif

image/tiff

ICO

.ico

image/ico

DIB

.dib

image/bmp

ICNS

.icns

image/icns

SGI

.sgi

image/sgi

JPEG2000

.j2c, .j2k, .jp2, .jpc, .jpf, .jpx

image/jp2

HEIC

.heic

image/heic
doubao-1.5-vision-pro及以后模型支持

HEIF

.heif

image/heif
doubao-1.5-vision-pro及以后模型支持

说明
上传文件至对象存储时设置，详情请参见文档。
传入 Base64编码时使用：Base64 编码输入。
图片格式需小写。
TIFF、 SGI、ICNS、JPEG2000 几种格式图片，需保证和元数据对齐，如在对象存储中正确设置文件元数据，否则会解析失败，详细请参见 使用视觉理解模型时，报错InvalidParameter？
API 参数字段说明
以下字段视觉理解暂不支持。
不支持设置频率惩罚系数，无 frequency_penalty 字段。
不支持设置存在惩罚系数，presence_penalty 字段。
不支持为单个请求生成多个返回，无 n 字段。
常见问题
使用视觉理解模型时，报错InvalidParameter？
