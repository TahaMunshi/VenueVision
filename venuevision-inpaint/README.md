---
title: VenueVision Inpaint
emoji: 🛋️
colorFrom: blue
colorTo: green
sdk: gradio
sdk_version: 6.9.0
app_file: app.py
pinned: false
license: mit
---

# VenueVision Inpaint

Click on objects in wall images to remove them. Uses **SAM2** + **LaMa** inpainting.

## API for VenueVision

Set in your `.env`:
```
INPAINT_SPACE_URL=TahaMunshi03/venuevision-inpaint
```

## Troubleshooting (HTTP 500 on `/config`)

If the backend logs show `Could not fetch config` for `*.hf.space`:

1. Open the Space on Hugging Face → **Logs** (build + runtime). A **500** on `/config` means the Gradio app crashed on startup (OOM, import error, incompatible Gradio version).
2. **OOM**: upgrade Space hardware or use a smaller SAM2 checkpoint / lazy-load only inside `predict`.
3. **Local test**: `pip install -r requirements.inpaint.txt` then `python app.py` and open `http://127.0.0.1:7860` — fix errors before pushing.
4. Point VenueVision at a working URL: `INPAINT_SPACE_URL=http://127.0.0.1:7860` (when running the Space on the same machine; from Docker use `http://host.docker.internal:7860` on Windows).
