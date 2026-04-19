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
    Primary path uses TRELLIS on HuggingFace, with a local demo-safe fallback.
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
            
            allow_placeholder_fallback = os.getenv("ALLOW_PLACEHOLDER_ASSET_FALLBACK", "").lower() in ("1", "true", "yes")
            # Primary TRELLIS generation path. Placeholder fallback is opt-in only.
            strategies = [
                ("HuggingFace TRELLIS", self._try_huggingface),
            ]
            if allow_placeholder_fallback:
                strategies.append(("Local fallback GLB", self._try_local_fallback_glb))
            
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
                    'error': self._format_trellis_error(last_error)
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
                api_info = self._get_space_api_info(client)
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

                # Some TRELLIS versions return non-image structures here; always keep a safe fallback.
                image_input = self._normalize_image_input(preprocessed, input_image_path, handle_file)
                
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

                endpoint_params = self._get_endpoint_parameters(api_info, image_to_3d_api)
                if endpoint_params:
                    logger.info(
                        "TRELLIS: image_to_3d endpoint parameters: %s",
                        [p.get("parameter_name") or p.get("label") for p in endpoint_params]
                    )

                # Different TRELLIS space versions expose different signatures.
                # To conserve ZeroGPU quota, keep retries minimal unless signature mismatch is detected.
                schema_args = self._build_image_to_3d_args(endpoint_params, image_input)
                result = None
                generation_attempts = []
                if schema_args:
                    generation_attempts.append(tuple(schema_args))

                # Legacy fallbacks only help when endpoint signature differs from schema.
                legacy_attempts = [
                    (image_input, [], 42, 7.5, 12, 3.0, 12, "stochastic"),
                    (image_input, 42, 7.5, 12, 3.0, 12, [], "stochastic"),
                    (image_input,),
                    (image_input, 42),
                ]

                max_attempts = 1
                try:
                    max_attempts = max(1, int(os.getenv("TRELLIS_MAX_IMAGE_TO_3D_ATTEMPTS", "1")))
                except Exception:
                    max_attempts = 1

                last_gen_error = None
                used_legacy_fallback = False
                attempt_index = 0
                while attempt_index < len(generation_attempts):
                    args = generation_attempts[attempt_index]
                    attempt_index += 1
                    try:
                        result = client.predict(*args, api_name=image_to_3d_api)
                        break
                    except Exception as e:
                        last_gen_error = str(e)
                        logger.warning(f"TRELLIS: image_to_3d attempt failed with {len(args)} args: {e}")
                        # Do not burn quota on retries when upstream/quota failures are already clear.
                        if self._is_non_retryable_trellis_error(last_gen_error):
                            break

                        # Only try legacy signatures when we likely have an argument mismatch.
                        if (not used_legacy_fallback) and self._is_signature_mismatch_error(last_gen_error):
                            used_legacy_fallback = True
                            for legacy_args in legacy_attempts:
                                if legacy_args not in generation_attempts:
                                    generation_attempts.append(legacy_args)

                        # Respect configured max attempts to preserve quota.
                        if len(generation_attempts) > max_attempts:
                            del generation_attempts[max_attempts:]
                if result is None:
                    return False, self._format_trellis_error(f"TRELLIS image_to_3d failed: {last_gen_error}")
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
        
        return False, self._format_trellis_error(f"HuggingFace spaces failed: {last_error}")

    def _format_trellis_error(self, error: Optional[str]) -> str:
        """Convert raw TRELLIS/Gradio errors into a user-actionable message."""
        raw = (error or "").strip()
        low = raw.lower()

        if "zerogpu" in low or "quota" in low or "running out of daily" in low:
            return (
                "TRELLIS generation failed: HuggingFace ZeroGPU quota is exhausted for this token/account. "
                "Set a fresh HF_TOKEN with available quota (or Pro) and restart backend."
            )
        if "upstream gradio app has raised an exception" in low:
            return (
                "TRELLIS generation failed: HuggingFace TRELLIS upstream is currently failing. "
                "Try again shortly or use a different HF_TOKEN/account and restart backend."
            )
        if raw:
            return f"TRELLIS generation failed: {raw}"
        return "TRELLIS generation failed: Unknown upstream error."

    def _is_non_retryable_trellis_error(self, error: Optional[str]) -> bool:
        """Errors where retrying image_to_3d immediately will likely waste quota/time."""
        low = (error or "").lower()
        markers = (
            "zerogpu",
            "quota",
            "running out of daily",
            "upstream gradio app has raised an exception",
            "service unavailable",
            "too many requests",
        )
        return any(marker in low for marker in markers)

    def _is_signature_mismatch_error(self, error: Optional[str]) -> bool:
        """Detect argument/signature errors where trying legacy arg patterns can help."""
        low = (error or "").lower()
        markers = (
            "missing",
            "unexpected keyword",
            "positional argument",
            "takes ",
            "required positional argument",
            "got an unexpected",
            "wrong number of arguments",
            "validation error",
        )
        return any(marker in low for marker in markers)

    def _try_local_fallback_glb(self, input_image_path: str, output_dir: str) -> Tuple[bool, Optional[str]]:
        """
        Emergency fallback used when TRELLIS upstream is down/unavailable.
        Generates a valid GLB placeholder so asset workflow remains operational.
        """
        try:
            import numpy as np
            from pygltflib import GLTF2, Scene, Node, Mesh, Buffer, BufferView, Accessor, Asset

            # Build a simple centered box (1m x 1m x 1m) with floor-aligned base.
            w, h, d = 0.5, 1.0, 0.5
            vertices = np.array(
                [
                    [-w, 0.0, -d], [w, 0.0, -d], [w, h, -d], [-w, h, -d],
                    [-w, 0.0, d], [w, 0.0, d], [w, h, d], [-w, h, d],
                ],
                dtype=np.float32,
            )
            indices = np.array(
                [
                    0, 1, 2, 2, 3, 0,  # back
                    4, 5, 6, 6, 7, 4,  # front
                    0, 4, 7, 7, 3, 0,  # left
                    1, 5, 6, 6, 2, 1,  # right
                    3, 2, 6, 6, 7, 3,  # top
                    0, 1, 5, 5, 4, 0,  # bottom
                ],
                dtype=np.uint16,
            )

            vertex_bytes = vertices.tobytes()
            index_bytes = indices.tobytes()
            buffer_data = vertex_bytes + index_bytes

            gltf = GLTF2(
                asset=Asset(version="2.0"),
                scenes=[Scene(nodes=[0])],
                scene=0,
                nodes=[Node(mesh=0)],
                meshes=[Mesh(primitives=[{"attributes": {"POSITION": 0}, "indices": 1}])],
                buffers=[Buffer(byteLength=len(buffer_data))],
                bufferViews=[
                    BufferView(buffer=0, byteOffset=0, byteLength=len(vertex_bytes), target=34962),
                    BufferView(buffer=0, byteOffset=len(vertex_bytes), byteLength=len(index_bytes), target=34963),
                ],
                accessors=[
                    Accessor(
                        bufferView=0,
                        byteOffset=0,
                        componentType=5126,  # FLOAT
                        count=len(vertices),
                        type="VEC3",
                        max=[float(np.max(vertices[:, 0])), float(np.max(vertices[:, 1])), float(np.max(vertices[:, 2]))],
                        min=[float(np.min(vertices[:, 0])), float(np.min(vertices[:, 1])), float(np.min(vertices[:, 2]))],
                    ),
                    Accessor(
                        bufferView=1,
                        byteOffset=0,
                        componentType=5123,  # UNSIGNED_SHORT
                        count=len(indices),
                        type="SCALAR",
                    ),
                ],
            )

            gltf.set_binary_blob(buffer_data)
            os.makedirs(output_dir, exist_ok=True)
            fallback_path = os.path.join(output_dir, "generated_model.glb")
            gltf.save(fallback_path)
            logger.warning(
                "TRELLIS unavailable; generated local fallback GLB instead. input=%s output=%s",
                input_image_path,
                fallback_path,
            )
            return True, None
        except Exception as e:
            return False, f"Local fallback generation failed: {e}"
    
    def _handle_gradio_result(self, result, output_dir: str) -> Tuple[bool, Optional[str]]:
        """Handle various result formats from Gradio API calls."""
        if result is None:
            return False, "Empty result from HuggingFace space"
        
        logger.info(f"Handling gradio result: type={type(result)}, value={str(result)[:200]}")

        candidates = self._extract_file_candidates(result)
        if not candidates:
            return False, f"Could not extract file from result: {type(result)}"

        logger.info(f"TRELLIS: Found {len(candidates)} possible file candidates in result")
        last_error = None
        for candidate in candidates:
            success, err = self._save_gradio_file(candidate, output_dir)
            if success:
                return True, None
            last_error = err

        return False, last_error or f"Could not extract usable file from result: {type(result)}"

    def _extract_file_candidates(self, value) -> List[str]:
        """
        Recursively extract possible file references from Gradio/TRELLIS outputs.
        Handles nested dict/list payloads and FileData-like objects.
        """
        ranked: List[Tuple[int, str]] = []
        seen = set()
        model_exts = {'.glb', '.gltf', '.obj'}
        non_model_exts = {'.mp4', '.webm', '.gif', '.png', '.jpg', '.jpeg', '.bmp'}

        def score_candidate(candidate: str, key_hint: Optional[str]) -> int:
            score = 0
            parsed = urlparse(candidate)
            lower = parsed.path.lower()
            ext = os.path.splitext(lower)[1]
            if ext in model_exts:
                score += 100
            elif ext in non_model_exts:
                score -= 100
            if key_hint:
                key_hint = key_hint.lower()
                if any(k in key_hint for k in ('glb', 'gltf', 'obj', 'mesh', 'model', 'file')):
                    score += 40
                if any(k in key_hint for k in ('video', 'preview', 'image', 'thumbnail')):
                    score -= 40
            return score

        def add_candidate(candidate, key_hint: Optional[str] = None) -> None:
            if not isinstance(candidate, str):
                return
            candidate = candidate.strip()
            if not candidate:
                return
            if candidate in seen:
                return
            seen.add(candidate)
            ranked.append((score_candidate(candidate, key_hint), candidate))

        def walk(node, key_hint: Optional[str] = None) -> None:
            if node is None:
                return

            if isinstance(node, str):
                add_candidate(node, key_hint)
                return

            # Gradio may return custom FileData objects with path/url attributes.
            if hasattr(node, "path"):
                add_candidate(getattr(node, "path", None), "path")
            if hasattr(node, "url"):
                add_candidate(getattr(node, "url", None), "url")
            if hasattr(node, "name"):
                add_candidate(getattr(node, "name", None), "name")

            if isinstance(node, dict):
                priority_keys = (
                    "path", "url", "name", "orig_name", "download_url",
                    "file", "files", "value", "data", "output", "mesh", "glb"
                )
                for key in priority_keys:
                    if key in node:
                        walk(node[key], key)
                for key, item in node.items():
                    if key not in priority_keys:
                        walk(item, str(key))
                return

            if isinstance(node, (list, tuple, set)):
                for item in node:
                    walk(item, key_hint)
                return

            # As a last resort, inspect object's __dict__ if available.
            obj_dict = getattr(node, "__dict__", None)
            if isinstance(obj_dict, dict):
                walk(obj_dict, key_hint)

        walk(value)
        ranked.sort(key=lambda item: item[0], reverse=True)
        return [candidate for _, candidate in ranked]
    
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
                    if 'model/gltf-binary' in content_type:
                        ext = '.glb'
                    elif 'model/gltf+json' in content_type:
                        ext = '.gltf'
                    elif 'application/octet-stream' in content_type and resp.content[:4] == b'glTF':
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
            ext = os.path.splitext(file_path)[1].lower()
            if ext not in allowed_model_exts:
                inferred_ext = self._infer_model_extension_from_file(file_path)
                if inferred_ext:
                    ext = inferred_ext
                else:
                    return False, f"Unsupported generated file type: {ext or '(no extension)'}"
            output_path = os.path.join(output_dir, f'generated_model{ext}')
            shutil.copy2(file_path, output_path)
            logger.info(f"HuggingFace: Copied model ({file_size} bytes) from {file_path}")
            return True, None
        
        return False, f"File not found: {file_path}"

    def _infer_model_extension_from_file(self, file_path: str) -> Optional[str]:
        """Infer model format from file contents when extension is missing/wrong."""
        try:
            with open(file_path, 'rb') as f:
                header = f.read(2048)

            # GLB magic bytes
            if len(header) >= 4 and header[:4] == b'glTF':
                return '.glb'

            # OBJ tends to be text with vertex/object markers
            text_head = header.decode('utf-8', errors='ignore').lstrip()
            if text_head.startswith('o ') or text_head.startswith('v ') or '\nv ' in text_head:
                return '.obj'

            # GLTF JSON usually starts with a JSON object and contains "asset"
            if text_head.startswith('{') and '"asset"' in text_head:
                return '.gltf'
        except Exception:
            return None

        return None

    def _get_space_api_names(self, client) -> set:
        """Best-effort introspection of available Gradio API names."""
        names = set()
        api_info = self._get_space_api_info(client)
        if isinstance(api_info, dict):
            named = api_info.get("named_endpoints", {})
            if isinstance(named, dict):
                names.update(named.keys())
            unnamed = api_info.get("unnamed_endpoints", {})
            if isinstance(unnamed, dict):
                names.update(unnamed.keys())
        return names

    def _get_space_api_info(self, client) -> Dict:
        """Best-effort fetch of Gradio API schema/details."""
        try:
            api_info = client.view_api(return_format="dict")
            if isinstance(api_info, dict):
                return api_info
        except Exception as e:
            logger.warning(f"HuggingFace: Could not inspect API schema: {e}")
        return {}

    def _get_endpoint_parameters(self, api_info: Dict, api_name: str) -> List[Dict]:
        """Get parameter metadata for a named endpoint if available."""
        if not isinstance(api_info, dict):
            return []
        named = api_info.get("named_endpoints", {})
        if not isinstance(named, dict):
            return []
        endpoint = named.get(api_name, {})
        if not isinstance(endpoint, dict):
            return []
        params = endpoint.get("parameters", [])
        return params if isinstance(params, list) else []

    def _normalize_image_input(self, preprocessed_result, fallback_input_path: str, handle_file_fn):
        """Normalize preprocess output into a valid Gradio file input."""
        # Most common case: preprocess returns path string
        if isinstance(preprocessed_result, str):
            return handle_file_fn(preprocessed_result)

        # Some spaces return nested dict/list payloads with image path/url
        candidates = self._extract_file_candidates(preprocessed_result)
        image_exts = {'.png', '.jpg', '.jpeg', '.webp', '.bmp'}
        for candidate in candidates:
            parsed = urlparse(candidate)
            ext = os.path.splitext(parsed.path.lower())[1]
            if ext in image_exts or os.path.exists(candidate):
                try:
                    return handle_file_fn(candidate)
                except Exception:
                    continue

        # Guaranteed fallback to original upload
        return handle_file_fn(fallback_input_path)

    def _build_image_to_3d_args(self, parameters: List[Dict], image_input) -> List:
        """
        Build image_to_3d args from endpoint schema so calls survive
        TRELLIS/Gradio signature changes.
        """
        if not parameters:
            return []

        args: List = []
        for param in parameters:
            name = str(param.get("parameter_name") or param.get("label") or "").strip().lower()
            has_default = bool(param.get("parameter_has_default"))
            default = param.get("parameter_default")

            if any(k in name for k in ("image", "img", "input")) and "multi" not in name:
                args.append(image_input)
            elif any(k in name for k in ("multi", "gallery", "images")):
                args.append([])
            elif "seed" in name:
                args.append(42)
            elif "guidance" in name and "slat" in name:
                args.append(3.0)
            elif "guidance" in name:
                args.append(7.5)
            elif "step" in name or "sampling" in name:
                args.append(12)
            elif any(k in name for k in ("scheduler", "sampler", "mode")):
                args.append("stochastic")
            elif "randomize" in name:
                args.append(False)
            elif has_default:
                args.append(default)
            else:
                # Unknown required input: use a conservative placeholder by type when possible.
                component = str(param.get("component") or "").lower()
                if "checkbox" in component:
                    args.append(False)
                elif "number" in component or "slider" in component:
                    args.append(0)
                else:
                    args.append("")
        return args

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
