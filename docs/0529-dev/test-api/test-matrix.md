# Test Matrix

| 模块 | 正常场景 | 异常场景 |
|---|---|---|
| Health | 服务返回 `{ ok: true }` | 服务未启动 |
| Workspace create | 创建 workspace 成功 | name 过长或非法 |
| Workspace directory | workspaceId 存在返回目录 | workspaceId 不存在返回 404 |
| Workspace status | workspaceId 或 directory 查询成功 | manifest 与 DB 不一致 |
| Material upload | 上传 txt/png 成功 | 文件过大、非法文件名、不支持类型 |
| Material intake | 选择素材后生成 artifact | selected ref 不存在 |
| Brief | propose + approve 成功 | 缺少 material artifact |
| Storyboard | propose + approve 成功 | 缺少 approved brief |
| Shotprompt | compile + approve 成功 | 缺少 storyboard |
| Image prompt | propose/patch/list 成功 | promptText 为空 |
| Image batch | 带 key 创建成功 | 缺少 `Idempotency-Key` |
| Selected image | 选择成功 | candidate 不存在 |
| Video script | 已选图片后生成成功 | 未选图片返回 `NO_SELECTED_IMAGE` |
| Video batch | 带 key 创建成功 | stale script 返回 409 |
| Selected video | 选择成功 | candidate 不存在 |
| Final video | 所有 shot 选视频后创建成功 | 缺少 selection 返回 `MISSING_SELECTIONS` |
| Trace | workspace/shot trace 可查 | cursor/limit 非法 |
| Static files | 合法路径可读取 | path traversal 返回 400 |

