"""
InstantMesh Service for image-to-3D model conversion.
Converts 2D images to 3D .glb models using multiple strategies:
  1. Tripo3D API (reliable, requires TRIPO_API_KEY env var, free tier: 300 credits/month)
  2. HuggingFace Spaces via gradio_client (free, no signup, may be slow/unavailable)
  3. Placeholder fallback (always works, generates a simple cube)
"""

import os
import logging
import shutil
import tempfile
import time
import json
from typing import Optional, Dict, Tuple, List
from pathlib import Path

import requests as http_requests
from PIL import Image

logger = logging.getLogger(__name__)

# Configuration
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
USER_ASSETS_ROOT = os.path.join(BASE_DIR, "static", "user_assets")
TEMP_DIR = os.path.join(BASE_DIR, "temp", "instantmesh")

# Tripo3D API configuration
TRIPO_API_BASE = "https://api.tripo3d.ai/v2/openapi"
TRIPO_API_KEY = os.getenv('TRIPO_API_KEY', '')

# HuggingFace Space configuration
HF_SPACES = [
    "microsoft/TRELLIS",
]

# Allowed image extensions
ALLOWED_EXTENSIONS = {'.jpg', '.jpeg', '.png', '.webp'}
MAX_IMAGE_SIZE_MB = 10


class InstantMeshService:
    """
    Service for converting images to 3D models.
    Tries multiple strategies in order: Tripo3D API → HF Spaces → Placeholder.
    """
    
    def __init__(self):
        self._ensure_directories()
        self._log_configuration()
    
    def _ensure_directories(self) -> None:
        """Ensure required directories exist."""
        os.makedirs(USER_ASSETS_ROOT, exist_ok=True)
        os.makedirs(TEMP_DIR, exist_ok=True)
    
    def _log_configuration(self) -> None:
        """Log the current configuration."""
        if TRIPO_API_KEY:
            logger.info("Tripo3D API key configured - will use Tripo3D for 3D generation")
        else:
            logger.info(
                "No TRIPO_API_KEY set. To enable real 3D generation:\n"
                "  1. Sign up free at https://www.tripo3d.ai (300 credits/month)\n"
                "  2. Get API key from https://platform.tripo3d.ai\n"
                "  3. Set TRIPO_API_KEY environment variable\n"
                "  Falling back to HuggingFace Spaces / placeholder."
            )
    
    def _get_user_asset_dir(self, user_id: int) -> str:
        """Get or create user's asset directory."""
        user_dir = os.path.join(USER_ASSETS_ROOT, str(user_id))
        os.makedirs(user_dir, exist_ok=True)
        return user_dir
    
    def validate_image(self, file_bytes: bytes, filename: str) -> Tuple[bool, str]:
        """
        Validate uploaded image file.
        
        Args:
            file_bytes: Image file content
            filename: Original filename
            
        Returns:
            Tuple of (is_valid, error_message)
        """
        ext = os.path.splitext(filename.lower())[1]
        if ext not in ALLOWED_EXTENSIONS:
            return False, f"Invalid file type. Allowed: {', '.join(ALLOWED_EXTENSIONS)}"
        
        size_mb = len(file_bytes) / (1024 * 1024)
        if size_mb > MAX_IMAGE_SIZE_MB:
            return False, f"File too large. Maximum size: {MAX_IMAGE_SIZE_MB}MB"
        
        if len(file_bytes) < 100:
            return False, "File appears to be empty or corrupted"
        
        if not self._is_valid_image_header(file_bytes):
            return False, "Invalid image file format"
        
        return True, ""
    
    def _is_valid_image_header(self, file_bytes: bytes) -> bool:
        """Check if file has valid image magic bytes."""
        if file_bytes[:2] == b'\xff\xd8':
            return True  # JPEG
        if file_bytes[:8] == b'\x89PNG\r\n\x1a\n':
            return True  # PNG
        if file_bytes[:4] == b'RIFF' and file_bytes[8:12] == b'WEBP':
            return True  # WebP
        return False
    
    def generate_asset_filename(self, user_id: int) -> str:
        """Generate unique filename for user asset."""
        timestamp = int(time.time() * 1000)
        return f"user_{user_id}_{timestamp}.glb"
    
    def save_source_image(self, user_id: int, file_bytes: bytes, original_filename: str) -> str:
        """Save the source image for reference."""
        user_dir = self._get_user_asset_dir(user_id)
        timestamp = int(time.time() * 1000)
        ext = os.path.splitext(original_filename.lower())[1]
        image_filename = f"source_{user_id}_{timestamp}{ext}"
        image_path = os.path.join(user_dir, image_filename)
        
        with open(image_path, 'wb') as f:
            f.write(file_bytes)
        
        return f"user_assets/{user_id}/{image_filename}"
    
    def convert_image_to_3d(
        self,
        user_id: int,
        file_bytes: bytes,
        original_filename: str,
        asset_name: str
    ) -> Dict:
        """
        Convert an image to a 3D model. Tries strategies in order:
        1. Tripo3D API (if TRIPO_API_KEY is set)
        2. HuggingFace Spaces via gradio_client
        3. Placeholder fallback
        
        Returns:
            Dict with conversion result
        """
        temp_input_dir = None
        temp_output_dir = None
        
        try:
            # Create temporary directories
            temp_input_dir = tempfile.mkdtemp(prefix='im_input_', dir=TEMP_DIR)
            temp_output_dir = tempfile.mkdtemp(prefix='im_output_', dir=TEMP_DIR)
            
            # Save input image to temp
            ext = os.path.splitext(original_filename.lower())[1]
            input_image_path = os.path.join(temp_input_dir, f"input{ext}")
            with open(input_image_path, 'wb') as f:
                f.write(file_bytes)
            
            logger.info(f"Starting 3D conversion for user {user_id}, asset: {asset_name}")
            
            # Try strategies in order
            strategies = [
                ("Tripo3D API", self._try_tripo3d),
                ("HuggingFace Space", self._try_huggingface),
                ("Placeholder", self._try_placeholder),
            ]
            
            last_error = None
            for strategy_name, strategy_fn in strategies:
                try:
                    logger.info(f"Trying strategy: {strategy_name}")
                    success, error_msg = strategy_fn(input_image_path, temp_output_dir)
                    
                    if success:
                        logger.info(f"Strategy {strategy_name} succeeded!")
                        break
                    else:
                        last_error = error_msg
                        logger.warning(f"Strategy {strategy_name} failed: {error_msg}")
                except Exception as e:
                    last_error = str(e)
                    logger.warning(f"Strategy {strategy_name} error: {e}")
                    continue
            else:
                return {
                    'success': False,
                    'error': f'All 3D generation strategies failed. Last error: {last_error}'
                }
            
            # Find the generated GLB file
            glb_files = list(Path(temp_output_dir).rglob('*.glb'))
            if not glb_files:
                # Try OBJ → GLB conversion
                obj_files = list(Path(temp_output_dir).rglob('*.obj'))
                if obj_files:
                    glb_path = self._convert_obj_to_glb(str(obj_files[0]), temp_output_dir)
                    if glb_path:
                        glb_files = [Path(glb_path)]
                
                if not glb_files:
                    return {'success': False, 'error': 'No 3D model was generated'}
            
            source_glb = str(glb_files[0])
            
            # Move GLB to user's asset directory
            user_dir = self._get_user_asset_dir(user_id)
            glb_filename = self.generate_asset_filename(user_id)
            dest_glb_path = os.path.join(user_dir, glb_filename)
            shutil.move(source_glb, dest_glb_path)
            
            # Save source image
            source_image_path = self.save_source_image(user_id, file_bytes, original_filename)
            
            # Generate thumbnail from source image
            thumbnail_path = self._generate_thumbnail_from_image(
                file_bytes, user_id, original_filename
            )
            
            file_size = os.path.getsize(dest_glb_path)
            glb_relative_path = f"user_assets/{user_id}/{glb_filename}"
            
            logger.info(f"3D conversion successful: {glb_relative_path} ({file_size} bytes)")
            
            return {
                'success': True,
                'glb_path': glb_relative_path,
                'source_image_path': source_image_path,
                'thumbnail_url': thumbnail_path,
                'file_size_bytes': file_size
            }
            
        except Exception as e:
            logger.error(f"3D conversion error: {e}")
            return {'success': False, 'error': str(e)}
        finally:
            self._cleanup_temp_dirs(temp_input_dir, temp_output_dir)

    # =========================================================================
    # Strategy 1: Tripo3D API
    # =========================================================================
    
    def _try_tripo3d(self, input_image_path: str, output_dir: str) -> Tuple[bool, Optional[str]]:
        """
        Use Tripo3D cloud API for image-to-3D conversion.
        Requires TRIPO_API_KEY environment variable.
        Free tier: 300 credits/month at https://www.tripo3d.ai
        """
        api_key = TRIPO_API_KEY
        if not api_key:
            return False, "TRIPO_API_KEY not set. Sign up free at https://www.tripo3d.ai"
        
        try:
            headers = {"Authorization": f"Bearer {api_key}"}
            
            # Step 1: Upload the image
            logger.info("Tripo3D: Uploading image...")
            with open(input_image_path, 'rb') as f:
                upload_resp = http_requests.post(
                    f"{TRIPO_API_BASE}/upload",
                    headers=headers,
                    files={"file": (os.path.basename(input_image_path), f, "image/jpeg")},
                    timeout=60
                )
            
            if upload_resp.status_code != 200:
                error_detail = upload_resp.text[:200]
                return False, f"Tripo3D upload failed ({upload_resp.status_code}): {error_detail}"
            
            upload_data = upload_resp.json()
            if upload_data.get('code') != 0:
                return False, f"Tripo3D upload error: {upload_data.get('message', 'unknown')}"
            
            image_token = upload_data['data']['image_token']
            logger.info(f"Tripo3D: Image uploaded, token: {image_token[:20]}...")
            
            # Step 2: Create image-to-model task
            logger.info("Tripo3D: Creating 3D generation task...")
            task_resp = http_requests.post(
                f"{TRIPO_API_BASE}/task",
                headers={**headers, "Content-Type": "application/json"},
                json={
                    "type": "image_to_model",
                    "file": {
                        "type": "jpg",
                        "file_token": image_token
                    }
                },
                timeout=30
            )
            
            if task_resp.status_code != 200:
                error_detail = task_resp.text[:200]
                return False, f"Tripo3D task creation failed ({task_resp.status_code}): {error_detail}"
            
            task_data = task_resp.json()
            if task_data.get('code') != 0:
                return False, f"Tripo3D task error: {task_data.get('message', 'unknown')}"
            
            task_id = task_data['data']['task_id']
            logger.info(f"Tripo3D: Task created: {task_id}")
            
            # Step 3: Poll for completion (timeout: 5 minutes)
            logger.info("Tripo3D: Waiting for 3D model generation...")
            start_time = time.time()
            timeout = 300  # 5 minutes
            poll_interval = 5  # seconds
            
            while time.time() - start_time < timeout:
                status_resp = http_requests.get(
                    f"{TRIPO_API_BASE}/task/{task_id}",
                    headers=headers,
                    timeout=30
                )
                
                if status_resp.status_code != 200:
                    time.sleep(poll_interval)
                    continue
                
                status_data = status_resp.json()
                if status_data.get('code') != 0:
                    time.sleep(poll_interval)
                    continue
                
                task_info = status_data['data']
                status = task_info.get('status', '')
                progress = task_info.get('progress', 0)
                
                logger.info(f"Tripo3D: Status={status}, Progress={progress}%")
                
                if status == 'success':
                    # Step 4: Download the model
                    output = task_info.get('output', {})
                    model_url = output.get('model') or output.get('pbr_model')
                    
                    if not model_url:
                        return False, "Tripo3D: No model URL in response"
                    
                    logger.info(f"Tripo3D: Downloading model from {model_url[:50]}...")
                    model_resp = http_requests.get(model_url, timeout=120)
                    
                    if model_resp.status_code != 200:
                        return False, f"Tripo3D: Failed to download model ({model_resp.status_code})"
                    
                    # Save as GLB
                    output_path = os.path.join(output_dir, 'generated_model.glb')
                    with open(output_path, 'wb') as f:
                        f.write(model_resp.content)
                    
                    file_size = len(model_resp.content)
                    logger.info(f"Tripo3D: Model saved ({file_size} bytes)")
                    return True, None
                    
                elif status == 'failed':
                    error = task_info.get('task_error', {}).get('message', 'Unknown error')
                    return False, f"Tripo3D generation failed: {error}"
                
                time.sleep(poll_interval)
            
            return False, "Tripo3D: Generation timed out (>5 minutes)"
            
        except http_requests.exceptions.Timeout:
            return False, "Tripo3D: Request timed out"
        except http_requests.exceptions.ConnectionError:
            return False, "Tripo3D: Connection failed (check internet)"
        except Exception as e:
            return False, f"Tripo3D error: {str(e)}"

    # =========================================================================
    # Strategy 2: HuggingFace Spaces via gradio_client (Microsoft TRELLIS)
    # =========================================================================
    
    def _try_huggingface(self, input_image_path: str, output_dir: str) -> Tuple[bool, Optional[str]]:
        """
        Use Microsoft TRELLIS on HuggingFace for image-to-3D conversion.
        Free, no API key needed. Uses cloud GPU on HF Spaces.
        May be slow on first call (space cold start ~1-2 min).
        """
        try:
            from gradio_client import Client, handle_file
        except ImportError:
            return False, "gradio_client not installed"
        
        last_error = None
        
        for space_name in HF_SPACES:
            try:
                logger.info(f"HuggingFace: Connecting to {space_name}...")
                
                hf_token = os.getenv('HF_TOKEN') or None
                client = Client(space_name, token=hf_token, verbose=False)
                
                logger.info(f"HuggingFace: Connected to {space_name}")
                
                # Initialize session (required for TRELLIS to create temp dirs)
                try:
                    client.predict(api_name="/start_session")
                    logger.info("TRELLIS: Session started")
                except Exception as e:
                    logger.warning(f"TRELLIS: Session start warning (may be ok): {e}")
                
                # TRELLIS pipeline: preprocess → image_to_3d → extract_glb
                # Step 1: Preprocess image (background removal + resize)
                logger.info("TRELLIS: Step 1/3 - Preprocessing image...")
                preprocessed = client.predict(
                    handle_file(input_image_path),
                    api_name="/preprocess_image"
                )
                logger.info(f"TRELLIS: Preprocessed image: {type(preprocessed)}")
                
                # Step 2: Generate 3D model from preprocessed image
                logger.info("TRELLIS: Step 2/3 - Generating 3D model (this takes 30-60s)...")
                result = client.predict(
                    handle_file(preprocessed) if isinstance(preprocessed, str) else preprocessed,
                    [],                # multiimages (empty)
                    42,                # seed
                    7.5,               # ss_guidance_strength
                    12,                # ss_sampling_steps  
                    3.0,               # slat_guidance_strength
                    12,                # slat_sampling_steps
                    "stochastic",      # multiimage_algo
                    api_name="/image_to_3d"
                )
                logger.info(f"TRELLIS: 3D generation complete, result type: {type(result)}")
                
                # Step 3: Extract GLB file
                logger.info("TRELLIS: Step 3/3 - Extracting GLB mesh...")
                glb_result = client.predict(
                    0.95,    # mesh_simplify
                    1024,    # texture_size
                    api_name="/extract_glb"
                )
                logger.info(f"TRELLIS: GLB extraction result: {type(glb_result)}")
                
                # Handle the result - could be tuple (model_path, download_path) or single path
                return self._handle_gradio_result(glb_result, output_dir)
                
            except Exception as e:
                last_error = str(e)
                logger.warning(f"HuggingFace: Space {space_name} error: {e}")
                continue
        
        return False, f"HuggingFace spaces failed: {last_error}"
    
    def _handle_gradio_result(self, result, output_dir: str) -> Tuple[bool, Optional[str]]:
        """Handle various result formats from Gradio API calls."""
        if result is None:
            return False, "Empty result from HuggingFace space"
        
        logger.info(f"Handling gradio result: type={type(result)}, value={str(result)[:200]}")
        
        # Result could be a file path string, tuple, or dict
        if isinstance(result, str):
            return self._save_gradio_file(result, output_dir)
        elif isinstance(result, (tuple, list)):
            # Try each element - look for a file path
            for item in result:
                if isinstance(item, str) and item and os.path.exists(item):
                    success, err = self._save_gradio_file(item, output_dir)
                    if success:
                        return True, None
                elif isinstance(item, dict):
                    # Could be a FileData dict with 'path' key
                    path = item.get('path') or item.get('value') or item.get('url') or item.get('name')
                    if path:
                        success, err = self._save_gradio_file(str(path), output_dir)
                        if success:
                            return True, None
            # If nothing worked with exists check, try first string anyway
            for item in result:
                if isinstance(item, str) and item:
                    return self._save_gradio_file(item, output_dir)
        elif isinstance(result, dict):
            path = result.get('path') or result.get('value') or result.get('url') or result.get('name')
            if path:
                return self._save_gradio_file(str(path), output_dir)
        
        return False, f"Could not extract file from result: {type(result)}"
    
    def _save_gradio_file(self, file_path: str, output_dir: str) -> Tuple[bool, Optional[str]]:
        """Save a file from gradio's temp/download location to our output dir."""
        if not file_path:
            return False, "Empty file path"
        
        # Handle HTTP URLs (gradio sometimes returns download URLs)
        if file_path.startswith('http'):
            try:
                resp = http_requests.get(file_path, timeout=120)
                if resp.status_code != 200:
                    return False, f"Download failed: HTTP {resp.status_code}"
                ext = '.glb' if '.glb' in file_path.lower() else '.obj'
                output_path = os.path.join(output_dir, f'generated_model{ext}')
                with open(output_path, 'wb') as f:
                    f.write(resp.content)
                logger.info(f"HuggingFace: Downloaded model ({len(resp.content)} bytes)")
                return True, None
            except Exception as e:
                return False, f"Download error: {e}"
        
        # Handle local file paths (gradio downloads to temp)
        if os.path.exists(file_path):
            file_size = os.path.getsize(file_path)
            if file_size < 100:
                return False, f"File too small ({file_size} bytes), likely not a valid model"
            ext = os.path.splitext(file_path)[1] or '.glb'
            output_path = os.path.join(output_dir, f'generated_model{ext}')
            shutil.copy2(file_path, output_path)
            logger.info(f"HuggingFace: Copied model ({file_size} bytes) from {file_path}")
            return True, None
        
        return False, f"File not found: {file_path}"

    # =========================================================================
    # Strategy 3: Placeholder fallback
    # =========================================================================
    
    def _try_placeholder(self, input_image_path: str, output_dir: str) -> Tuple[bool, Optional[str]]:
        """
        Fallback: creates a placeholder cube GLB.
        Always works, useful for development/testing.
        """
        try:
            import numpy as np
            from pygltflib import (
                GLTF2, Scene, Node, Mesh, Primitive, Buffer, BufferView, Accessor,
                Material, PbrMetallicRoughness,
                ARRAY_BUFFER, ELEMENT_ARRAY_BUFFER, FLOAT, UNSIGNED_SHORT, TRIANGLES
            )
            import base64
            
            logger.info("Using placeholder 3D generation (textured cube)")
            
            # Create a cube with per-face vertices for proper normals
            vertices = np.array([
                # Front face
                -0.5, -0.5,  0.5,   0.5, -0.5,  0.5,   0.5,  0.5,  0.5,  -0.5,  0.5,  0.5,
                # Back face
                -0.5, -0.5, -0.5,  -0.5,  0.5, -0.5,   0.5,  0.5, -0.5,   0.5, -0.5, -0.5,
                # Top face
                -0.5,  0.5, -0.5,  -0.5,  0.5,  0.5,   0.5,  0.5,  0.5,   0.5,  0.5, -0.5,
                # Bottom face
                -0.5, -0.5, -0.5,   0.5, -0.5, -0.5,   0.5, -0.5,  0.5,  -0.5, -0.5,  0.5,
                # Right face
                 0.5, -0.5, -0.5,   0.5,  0.5, -0.5,   0.5,  0.5,  0.5,   0.5, -0.5,  0.5,
                # Left face
                -0.5, -0.5, -0.5,  -0.5, -0.5,  0.5,  -0.5,  0.5,  0.5,  -0.5,  0.5, -0.5,
            ], dtype=np.float32)
            
            indices = np.array([
                0,1,2, 0,2,3,  4,5,6, 4,6,7,  8,9,10, 8,10,11,
                12,13,14, 12,14,15,  16,17,18, 16,18,19,  20,21,22, 20,22,23,
            ], dtype=np.uint16)
            
            vertices_binary = vertices.tobytes()
            indices_binary = indices.tobytes()
            vertices_byte_length = len(vertices_binary)
            indices_byte_length = len(indices_binary)
            
            padding = (4 - (indices_byte_length % 4)) % 4
            indices_binary_padded = indices_binary + b'\x00' * padding
            binary_data = indices_binary_padded + vertices_binary
            
            data_uri = 'data:application/octet-stream;base64,' + base64.b64encode(binary_data).decode('utf-8')
            
            gltf = GLTF2(
                scene=0,
                scenes=[Scene(nodes=[0])],
                nodes=[Node(mesh=0)],
                meshes=[Mesh(primitives=[Primitive(
                    attributes={'POSITION': 1},
                    indices=0,
                    material=0
                )])],
                materials=[Material(
                    pbrMetallicRoughness=PbrMetallicRoughness(
                        baseColorFactor=[0.6, 0.4, 0.2, 1.0],
                        metallicFactor=0.1,
                        roughnessFactor=0.8
                    ),
                    name="PlaceholderMaterial"
                )],
                accessors=[
                    Accessor(
                        bufferView=0,
                        componentType=UNSIGNED_SHORT,
                        count=len(indices),
                        type='SCALAR',
                        max=[int(indices.max())],
                        min=[int(indices.min())]
                    ),
                    Accessor(
                        bufferView=1,
                        componentType=FLOAT,
                        count=len(vertices) // 3,
                        type='VEC3',
                        max=vertices.reshape(-1, 3).max(axis=0).tolist(),
                        min=vertices.reshape(-1, 3).min(axis=0).tolist()
                    )
                ],
                bufferViews=[
                    BufferView(buffer=0, byteOffset=0, byteLength=indices_byte_length, target=ELEMENT_ARRAY_BUFFER),
                    BufferView(buffer=0, byteOffset=indices_byte_length + padding, byteLength=vertices_byte_length, target=ARRAY_BUFFER)
                ],
                buffers=[Buffer(byteLength=len(binary_data), uri=data_uri)]
            )
            
            output_path = os.path.join(output_dir, 'generated_model.glb')
            gltf.save(output_path)
            
            logger.info(f"Placeholder model created: {output_path}")
            return True, None
            
        except ImportError as e:
            return False, f"Missing dependencies: {e}"
        except Exception as e:
            return False, f"Placeholder error: {str(e)}"

    # =========================================================================
    # Helper methods
    # =========================================================================
    
    def _convert_obj_to_glb(self, obj_path: str, output_dir: str) -> Optional[str]:
        """Convert OBJ file to GLB format using trimesh."""
        try:
            import trimesh
            mesh = trimesh.load(obj_path)
            glb_path = os.path.join(output_dir, 'converted_model.glb')
            mesh.export(glb_path, file_type='glb')
            return glb_path
        except ImportError:
            logger.warning("trimesh not available for OBJ to GLB conversion")
            return None
        except Exception as e:
            logger.error(f"OBJ to GLB conversion failed: {e}")
            return None
    
    def _generate_thumbnail_from_image(
        self, file_bytes: bytes, user_id: int, original_filename: str
    ) -> Optional[str]:
        """
        Generate a thumbnail from the source image.
        Uses the original photo as the asset thumbnail.
        """
        try:
            from io import BytesIO
            
            img = Image.open(BytesIO(file_bytes))
            
            # Resize to thumbnail (256x256, maintaining aspect ratio)
            img.thumbnail((256, 256), Image.LANCZOS)
            
            # Create square thumbnail with padding
            thumb = Image.new('RGB', (256, 256), (30, 30, 50))
            offset_x = (256 - img.size[0]) // 2
            offset_y = (256 - img.size[1]) // 2
            
            # Convert to RGB if necessary
            if img.mode == 'RGBA':
                bg = Image.new('RGB', img.size, (30, 30, 50))
                bg.paste(img, mask=img.split()[3])
                thumb.paste(bg, (offset_x, offset_y))
            else:
                if img.mode != 'RGB':
                    img = img.convert('RGB')
                thumb.paste(img, (offset_x, offset_y))
            
            # Save thumbnail
            user_dir = self._get_user_asset_dir(user_id)
            timestamp = int(time.time() * 1000)
            thumbnail_filename = f"thumb_{user_id}_{timestamp}.png"
            thumbnail_path = os.path.join(user_dir, thumbnail_filename)
            thumb.save(thumbnail_path, 'PNG')
            
            return f"user_assets/{user_id}/{thumbnail_filename}"
            
        except Exception as e:
            logger.warning(f"Thumbnail generation failed: {e}")
            return None
    
    def _cleanup_temp_dirs(self, *dirs) -> None:
        """Clean up temporary directories."""
        for dir_path in dirs:
            if dir_path and os.path.exists(dir_path):
                try:
                    shutil.rmtree(dir_path, ignore_errors=True)
                except Exception as e:
                    logger.warning(f"Failed to cleanup temp dir {dir_path}: {e}")
    
    def cleanup_old_temp_files(self, max_age_hours: int = 24) -> int:
        """Clean up old temporary files."""
        if not os.path.exists(TEMP_DIR):
            return 0
        
        cleaned = 0
        cutoff_time = time.time() - (max_age_hours * 3600)
        
        try:
            for item in os.listdir(TEMP_DIR):
                item_path = os.path.join(TEMP_DIR, item)
                if os.path.isdir(item_path):
                    if os.path.getmtime(item_path) < cutoff_time:
                        shutil.rmtree(item_path, ignore_errors=True)
                        cleaned += 1
        except Exception as e:
            logger.error(f"Error during temp cleanup: {e}")
        
        return cleaned


# Singleton instance
instantmesh_service = InstantMeshService()


def get_instantmesh_service() -> InstantMeshService:
    """Get the InstantMesh service instance."""
    return instantmesh_service
