# Review note 2026-05-23: MinIO service role

## Question

MinIO 支持的服务是什么？

## Answer

MinIO is an S3-compatible object storage service. In this project, it is not a database and not a queue. Its role is to store binary objects that should not live in Postgres or Git.

For this AIGC video system, MinIO would store:

- Uploaded product images.
- Generated final videos.
- Generated clips if future versions add shot-level rendering.
- Optional generated audio, subtitle files, thumbnails, or export artifacts.
- Demo assets when the project needs a deployment-friendly object-store path.

In the current `infra/docker-compose.yml`, MinIO exposes two ports:

- `9000`: S3-compatible API endpoint used by the application or SDK.
- `9001`: MinIO web console for humans to inspect buckets and objects.

The existing compose service:

```yaml
minio:
  image: minio/minio:RELEASE.2024-12-18T13-15-44Z
  command: server /data --console-address ":9001"
  environment:
    MINIO_ROOT_USER: minioadmin
    MINIO_ROOT_PASSWORD: minioadmin
  ports:
    - "9000:9000"
    - "9001:9001"
  volumes:
    - minio-data:/data
```

Recommended architecture boundary:

- Postgres stores business facts: Product, Asset metadata, Script, StoryboardShot, GenerationJob.
- MinIO stores object bytes: images, videos, audio, subtitle files.
- Postgres `asset.url` or storage key points to the object in MinIO.
- Redis/BullMQ stores transient queue execution state, not long-lived object bytes.

For V0, current code still uses local upload storage under `apps/server/tmp/uploads` and mock files under `apps/web/public/mocks`. MinIO is a deployment-oriented upgrade path, useful when we need stable object storage, presigned upload/download URLs, or multi-container deployment.
