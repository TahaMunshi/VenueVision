# Tripo3D API reference

Official docs: **https://platform.tripo3d.ai/docs**

## Upload in STS (from official docs)

**Two-step flow:**

### 1. Get STS Token
- **Endpoint:** `POST https://api.tripo3d.ai/v2/openapi/upload/sts/token`
- **Headers:** `Content-Type: application/json`, `Authorization: Bearer ${APIKEY}`
- **Body:** `{ "format": "webp" }` — for image use `webp`, `jpeg` or `png`. Suggested resolution > 256×256px.
- **Response:** `code`, `data` with:
  - `s3_host`, `resource_bucket` (tripo-data), `resource_uri` (S3 key)
  - `session_token`, `sts_ak`, `sts_sk` (temporary AWS creds)

### 2. Upload with STS token
- Use **AWS SDK** (e.g. boto3) to upload the file to S3:
  - Bucket: `resource_bucket`, Key: `resource_uri`
  - Credentials: `sts_ak`, `sts_sk`, `session_token`, region `us-west-2`
- After upload, use `resource_uri` (or the value the task API expects) when creating the task.

---

## Still needed: Create task (image_to_model / multiview)

Please paste from docs the exact **Create task** request for:
- **Single image:** type `image_to_model` — which field holds the uploaded image ref? (`image_token`, `image_uri`, `resource_uri`?)
- **Multiview:** type `multiview_to_3d` or `multiview_to_model` — body shape (flat keys vs `files` array) and field names.
