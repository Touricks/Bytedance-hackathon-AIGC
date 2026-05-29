Example:
```
curl https://ark.cn-beijing.volces.com/api/v3/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ark-2c5d09f6-25c3-462d-af0f-c0769da97efa-b5968" \
  -d $'{
    "messages": [
        {
            "content": [
                {
                    "text": "下面人物是目标人物",
                    "type": "text"
                },
                {
                    "image_url": {
                        "url": "https://ark-project.tos-cn-beijing.volces.com/doc_image/target.png"
                    },
                    "type": "image_url"
                },
                {
                    "text": "请确认下面图片中是否含有目标人物",
                    "type": "text"
                }
            ],
            "role": "system"
        },
        {
            "content": [
                {
                    "image_url": {
                        "url": "https://ark-project.tos-cn-beijing.volces.com/doc_image/scene_01.png"
                    },
                    "type": "image_url"
                },
                {
                    "text": "图片1中是否含有目标人物",
                    "type": "text"
                },
                {
                    "image_url": {
                        "url": "https://ark-project.tos-cn-beijing.volces.com/doc_image/scene_02.png"
                    },
                    "type": "image_url"
                },
                {
                    "text": "图片2中是否含有目标人物",
                    "type": "text"
                }
            ],
            "role": "user"
        }
    ],
    "model": "doubao-seed-2-0-pro-260215"
}'
```å