
### 核心配置参数
- **Base URL**：`https://ark.cn-beijing.volces.com/api/v3`
  部分工具无需填写后缀`/chat/completions`，若调用失败可尝试补充完整接口地址：`https://ark.cn-beijing.volces.com/api/v3/chat/completions`
- **Model**：填写模型对应的接入点`endpoint_id`，例如`ep-2025xxxxxxx`
- **API Key**
### 调用示例（Python）
```python
from openai import OpenAI

client = OpenAI(
    base_url="https://ark.cn-beijing.volces.com/api/v3",
    api_key="your-api-key"
)

response = client.chat.completions.create(
    model="your-endpoint-id",
    messages=[{"role": "user", "content": "Hello!"}]
)
print(response.choices[0].message.content)
```
