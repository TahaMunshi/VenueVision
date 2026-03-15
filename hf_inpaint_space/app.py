"""
VenueVision Inpaint Space: SAM2 + LaMa
Click on objects to remove them. Exposes /predict(image, x, y) for gradio_client.
"""
import os

# Force CPU - HF Spaces free tier has no GPU. Avoids "Found no NVIDIA driver" crash.
# Must be set BEFORE importing torch.
os.environ["CUDA_VISIBLE_DEVICES"] = ""

import tempfile
import numpy as np
import torch
from PIL import Image
import gradio as gr

# SimpleLama uses torch.jit.load() without map_location, which fails on CPU-only HF Spaces.
# Patch it to force CPU loading.
_orig_jit_load = torch.jit.load
def _jit_load_cpu(path, map_location=None, **kwargs):
    if map_location is None:
        map_location = torch.device("cpu")
    return _orig_jit_load(path, map_location=map_location, **kwargs)
torch.jit.load = _jit_load_cpu

# Lazy load models to speed up Space startup
_sam_model = None
_sam_processor = None
_lama = None


def get_sam():
    global _sam_model, _sam_processor
    if _sam_model is None:
        from transformers import Sam2Processor, Sam2Model
        model_id = "facebook/sam2.1-hiera-tiny"  # Smaller, faster; use "sam2.1-hiera-large" for better quality
        _sam_processor = Sam2Processor.from_pretrained(model_id)
        _sam_model = Sam2Model.from_pretrained(model_id)
        _sam_model.eval()
    return _sam_model, _sam_processor


def get_lama():
    global _lama
    if _lama is None:
        from simple_lama_inpainting import SimpleLama
        _lama = SimpleLama()
    return _lama


def point_to_mask(image: np.ndarray, x: int, y: int, device: str = "cpu"):
    """Use SAM2 to get mask from point click."""
    model, processor = get_sam()
    model = model.to(device)
    
    pil_image = Image.fromarray(image).convert("RGB")
    # SAM2 expects input_points: [[[[x, y]]]] and input_labels: [[[1]]]
    input_points = [[[[x, y]]]]
    input_labels = [[[1]]]  # 1 = foreground
    
    inputs = processor(
        images=pil_image,
        input_points=input_points,
        input_labels=input_labels,
        return_tensors="pt"
    ).to(device)
    
    with torch.no_grad():
        outputs = model(**inputs)
    
    masks = processor.post_process_masks(
        outputs.pred_masks.cpu(),
        inputs["original_sizes"]
    )[0]
    # masks shape: (1, num_masks, H, W) - take best mask
    mask = masks[0, 0].numpy()  # First object, first mask
    mask = (mask > 0.5).astype(np.uint8) * 255
    return mask


def inpaint(image: np.ndarray, mask: np.ndarray):
    """Use SimpleLama to inpaint masked region."""
    lama = get_lama()
    pil_image = Image.fromarray(image).convert("RGB")
    pil_mask = Image.fromarray(mask).convert("L")
    result = lama(pil_image, pil_mask)
    return np.array(result.convert("RGB"))


def dilate_mask(mask: np.ndarray, kernel_size: int = 15, iterations: int = 4):
    """Expand mask for better blending."""
    import cv2
    kernel = np.ones((kernel_size, kernel_size), np.uint8)
    return cv2.dilate(mask, kernel, iterations=iterations)


def predict(image, x: int, y: int):
    """
    Remove object at (x, y) from image.
    Called by gradio_client with: client.predict(image_path, x, y, api_name="/predict")
    """
    if image is None:
        return None
    
    # Handle Gradio file input (can be path string or dict)
    if isinstance(image, dict):
        image = image.get("path") or image.get("name") or image
    if isinstance(image, str):
        image = np.array(Image.open(image).convert("RGB"))
    else:
        image = np.array(image) if not isinstance(image, np.ndarray) else image
    
    if image.ndim == 2:
        image = np.stack([image] * 3, axis=-1)
    if image.shape[-1] == 4:
        image = image[..., :3]
    
    device = "cuda" if torch.cuda.is_available() else "cpu"
    
    # 1. SAM2: point -> mask
    mask = point_to_mask(image, int(x), int(y), device)
    
    # 2. Dilate mask
    mask = dilate_mask(mask)
    
    # 3. LaMa inpainting
    result = inpaint(image, mask)
    
    # 4. Save to temp file (gradio_client expects file path)
    out_path = tempfile.NamedTemporaryFile(suffix=".png", delete=False).name
    Image.fromarray(result).save(out_path)
    return out_path


# Build Gradio UI
with gr.Blocks(title="VenueVision Inpaint") as demo:
    gr.Markdown("## VenueVision: Click to Remove Objects")
    gr.Markdown("Upload a wall image and click on furniture/objects to remove them. Uses SAM2 + LaMa.")
    
    with gr.Row():
        img_in = gr.Image(type="filepath", label="Upload image")
        img_out = gr.Image(type="filepath", label="Result")
    
    with gr.Row():
        x_in = gr.Number(label="X (from click)", value=0, precision=0)
        y_in = gr.Number(label="Y (from click)", value=0, precision=0)
    
    run_btn = gr.Button("Remove object at (X, Y)", variant="primary")
    
    run_btn.click(
        fn=predict,
        inputs=[img_in, x_in, y_in],
        outputs=[img_out],
        api_name="predict"  # For gradio_client: client.predict(img, x, y, api_name="/predict")
    )
    
    # Click-to-remove: when user selects a point on the image
    def on_select(img, evt: gr.SelectData):
        if img is None or evt is None:
            return None, 0, 0
        x, y = evt.index[0], evt.index[1]
        result = predict(img, x, y)
        return result, x, y
    
    img_in.select(
        fn=on_select,
        inputs=[img_in],
        outputs=[img_out, x_in, y_in]
    )
    
if __name__ == "__main__":
    demo.launch(show_error=True)
