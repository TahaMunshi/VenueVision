---
title: VenueVision Inpaint
emoji: 🛋️
colorFrom: blue
colorTo: green
sdk: gradio
sdk_version: 4.44.0
app_file: app.py
pinned: false
license: mit
---

# VenueVision Inpaint

Click on objects in wall images to remove them. Uses **SAM2** (Segment Anything Model 2) + **LaMa** inpainting.

## Usage

1. Upload an image
2. Click on furniture/objects to remove them (or enter X, Y and click "Remove")
3. Download the result

## API for VenueVision

Use with `gradio_client` from your VenueVision backend:

```python
from gradio_client import Client, handle_file

client = Client("YOUR_USERNAME/venuevision-inpaint")  # Replace with your Space URL
result = client.predict(
    handle_file("/path/to/image.jpg"),
    320,  # x
    240,  # y
    api_name="predict"
)
# result = path to inpainted image
```

Set in your `.env`:
```
INPAINT_SPACE_URL=YOUR_USERNAME/venuevision-inpaint
```

## Models

- **SAM2** (facebook/sam2.1-hiera-tiny) - point-based segmentation
- **SimpleLama** - inpainting
