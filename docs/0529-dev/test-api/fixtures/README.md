# Test Fixtures

这里放接口测试和 Postman runner 使用的数据文件。

建议文件：

| 文件 | 用途 |
|---|---|
| `product-image.base64.txt` | 小尺寸透明 PNG 或商品图 base64 |
| `brief-approval.json` | brief approve payload |
| `storyboard-approval.json` | storyboard approve payload |
| `shotprompt-approval.json` | shotprompt approve payload |
| `image-batch-response.json` | 图片 batch mock 响应 |
| `video-batch-response.json` | 视频 batch mock 响应 |

注意：

- 不要提交真实用户素材。
- 不要提交 provider key。
- fixture 要尽量小，避免拖慢测试。

