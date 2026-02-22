"""
InstantMesh Service for image-to-3D model conversion.
Converts 2D images to 3D models using Microsoft TRELLIS on HuggingFace.
"""

import os
import logging
import shutil
import tempfile
import time
import json
from typing import Optional, Dict, Tuple, List
from pathlib import Path
from urllib.parse import urlparse

import requests as http_requests
from PIL import Image

logger = logging.getLogger(__name__)

# Configuration
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
USER_ASSETS_ROOT = os.path.join(BASE_DIR, "static", "user_assets")
TEMP_DIR = os.path.join(BASE_DIR, "temp", "instantmesh")

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
    TRELLIS-only generation path (no Tripo3D or placeholder fallback).
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
        if os.getenv('HF_TOKEN'):
            logger.info("HF_TOKEN detected - TRELLIS will use authenticated quota")
        else:
            logger.info("No HF_TOKEN set - TRELLIS will run on anonymous quota (may be rate-limited)")
    
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
        Convert an image to a 3D model using TRELLIS on HuggingFace.
        
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
            
            # TRELLIS-only generation path (intentionally no fallback cube generation)
            strategies = [
                ("HuggingFace TRELLIS", self._try_huggingface),
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
                    'error': f'TRELLIS generation failed: {last_error}'
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
    # Strategy: HuggingFace Spaces via gradio_client (Microsoft TRELLIS)
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

                api_names = self._get_space_api_names(client)
                logger.info(f"HuggingFace: Available API endpoints: {sorted(api_names) if api_names else 'unknown'}")
                
                # Initialize session (required for TRELLIS to create temp dirs)
                session_api = self._pick_api_name(api_names, ["/start_session"])
                if session_api:
                    try:
                        client.predict(api_name=session_api)
                        logger.info("TRELLIS: Session started")
                    except Exception as e:
                        logger.warning(f"TRELLIS: Session start warning (may be ok): {e}")
                
                # TRELLIS pipeline: preprocess → image_to_3d → extract_glb
                # Step 1: Preprocess image (background removal + resize)
                logger.info("TRELLIS: Step 1/3 - Preprocessing image...")
                preprocess_api = self._pick_api_name(api_names, [
                    "/preprocess_image",
                    "/preprocess",
                    "/preprocess_input",
                ])
                if preprocess_api:
                    preprocessed = client.predict(
                        handle_file(input_image_path),
                        api_name=preprocess_api
                    )
                    logger.info(f"TRELLIS: Preprocessed image with {preprocess_api}: {type(preprocessed)}")
                else:
                    logger.info("TRELLIS: No preprocess endpoint found, using original image")
                    preprocessed = input_image_path

                image_input = handle_file(preprocessed) if isinstance(preprocessed, str) else preprocessed
                
                # Step 2: Generate 3D model from preprocessed image
                logger.info("TRELLIS: Step 2/3 - Generating 3D model (this takes 30-60s)...")
                image_to_3d_api = self._pick_api_name(api_names, [
                    "/image_to_3d",
                    "/generate_3d",
                    "/generate",
                    "/run",
                ])
                if not image_to_3d_api:
                    return False, "TRELLIS: Could not find image-to-3D endpoint on HF space"

                # Different TRELLIS space versions expose different signatures.
                result = None
                generation_attempts = [
                    (image_input, [], 42, 7.5, 12, 3.0, 12, "stochastic"),
                    (image_input,),
                    (image_input, 42),
                ]
                last_gen_error = None
                for args in generation_attempts:
                    try:
                        result = client.predict(*args, api_name=image_to_3d_api)
                        break
                    except Exception as e:
                        last_gen_error = str(e)
                        logger.warning(f"TRELLIS: image_to_3d attempt failed with {len(args)} args: {e}")
                if result is None:
                    return False, f"TRELLIS image_to_3d failed: {last_gen_error}"
                logger.info(f"TRELLIS: 3D generation complete, result type: {type(result)}")
                
                # Step 3: Extract GLB file
                logger.info("TRELLIS: Step 3/3 - Extracting GLB mesh...")
                extract_api = self._pick_api_name(api_names, [
                    "/extract_glb",
                    "/extract_mesh",
                    "/export_glb",
                    "/download_glb",
                ])
                if extract_api:
                    extract_attempts = [
                        (0.95, 1024),
                        tuple(),
                    ]
                    last_extract_error = None
                    for args in extract_attempts:
                        try:
                            glb_result = client.predict(*args, api_name=extract_api)
                            logger.info(f"TRELLIS: GLB extraction result: {type(glb_result)}")
                            success, err = self._handle_gradio_result(glb_result, output_dir)
                            if success:
                                return True, None
                            last_extract_error = err
                        except Exception as e:
                            last_extract_error = str(e)
                            logger.warning(f"TRELLIS: extract attempt failed with {len(args)} args: {e}")
                    logger.warning(f"TRELLIS: extract endpoint failed, trying generation output directly: {last_extract_error}")
                
                # Some versions return file output directly from image_to_3d.
                success, err = self._handle_gradio_result(result, output_dir)
                if success:
                    return True, None
                return False, err or "TRELLIS did not return a usable 3D model file"
                
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
        
        # Result could be a file path string, tuple, dict, or nested structures.
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
            # Look recursively in nested dict/list structures.
            for v in result.values():
                if isinstance(v, (dict, list, tuple, str)):
                    success, err = self._handle_gradio_result(v, output_dir)
                    if success:
                        return True, None
        
        return False, f"Could not extract file from result: {type(result)}"
    
    def _save_gradio_file(self, file_path: str, output_dir: str) -> Tuple[bool, Optional[str]]:
        """Save a file from gradio's temp/download location to our output dir."""
        if not file_path:
            return False, "Empty file path"
        allowed_model_exts = {'.glb', '.gltf', '.obj'}
        
        # Handle HTTP URLs (gradio sometimes returns download URLs)
        if file_path.startswith('http'):
            try:
                resp = http_requests.get(file_path, timeout=120)
                if resp.status_code != 200:
                    return False, f"Download failed: HTTP {resp.status_code}"
                content_type = (resp.headers.get('content-type') or '').lower()
                if 'text/html' in content_type:
                    return False, "Download URL returned HTML instead of model data"
                parsed = urlparse(file_path)
                lower_path = parsed.path.lower()
                if lower_path.endswith('.gltf'):
                    ext = '.gltf'
                elif lower_path.endswith('.obj'):
                    ext = '.obj'
                elif lower_path.endswith('.glb'):
                    ext = '.glb'
                else:
                    return False, f"URL does not point to a supported 3D model file: {file_path}"
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
            if ext.lower() not in allowed_model_exts:
                return False, f"Unsupported generated file type: {ext}"
            output_path = os.path.join(output_dir, f'generated_model{ext}')
            shutil.copy2(file_path, output_path)
            logger.info(f"HuggingFace: Copied model ({file_size} bytes) from {file_path}")
            return True, None
        
        return False, f"File not found: {file_path}"

    def _get_space_api_names(self, client) -> set:
        """Best-effort introspection of available Gradio API names."""
        names = set()
        try:
            api_info = client.view_api(return_format="dict")
            if isinstance(api_info, dict):
                named = api_info.get("named_endpoints", {})
                if isinstance(named, dict):
                    names.update(named.keys())
                unnamed = api_info.get("unnamed_endpoints", {})
                if isinstance(unnamed, dict):
                    names.update(unnamed.keys())
        except Exception as e:
            logger.warning(f"HuggingFace: Could not inspect API schema: {e}")
        return names

    def _pick_api_name(self, available_names: set, candidates: List[str]) -> Optional[str]:
        """Pick first candidate endpoint that exists, or first candidate if API list unknown."""
        if not available_names:
            return candidates[0] if candidates else None
        for name in candidates:
            if name in available_names:
                return name
        return None

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
