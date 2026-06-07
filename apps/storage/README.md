# @aigc-video/storage

MinIO / S3-compatible storage utilities for local smoke tests and cloud storage setup.

## Local MinIO

Start infra:

```sh
docker compose -f infra/docker-compose.yml up -d minio
```

When the server or smoke script runs on the host machine:

```sh
S3_ENDPOINT=http://localhost:9000
S3_ACCESS_KEY=minioadmin
S3_SECRET_KEY=minioadmin
S3_BUCKET=aigc-video
S3_FORCE_PATH_STYLE=true
pnpm --filter @aigc-video/storage smoke
```

When the server runs inside Docker or Kubernetes, use the container or service name instead:

```sh
S3_ENDPOINT=http://minio:9000
```

For cloud object storage, keep application code unchanged and replace the endpoint,
credentials, bucket, and region with the provider values.
