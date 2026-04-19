import os
from typing import Dict, List, Optional, Any

from pygltflib import GLTF2, Scene, Node, Mesh, Buffer, BufferView, Accessor, Asset, Material
import numpy as np


def _hex_to_rgba(hex_color: str) -> List[float]:
    """Convert #RRGGBB to [r, g, b, 1.0] normalized 0-1."""
    h = hex_color.lstrip("#")
    if len(h) != 6:
        return [0.8, 0.8, 0.8, 1.0]
    r = int(h[0:2], 16) / 255.0
    g = int(h[2:4], 16) / 255.0
    b = int(h[4:6], 16) / 255.0
    return [r, g, b, 1.0]


def _plane_vertices(width: float, height: float) -> tuple:
    """Create a horizontal plane (XZ) vertices and indices. Centered at origin."""
    hw, hh = width / 2, height / 2
    verts = np.array([
        [-hw, 0, -hh], [hw, 0, -hh], [hw, 0, hh], [-hw, 0, hh]
    ], dtype=np.float32)
    inds = np.array([0, 1, 2, 0, 2, 3], dtype=np.uint16)
    return verts, inds


def _box_vertices(width: float, height: float, depth: float):
    # Box centered at origin
    w = width / 2.0
    h = height
    d = depth / 2.0
    # 8 vertices
    return np.array(
        [
            [-w, 0, -d],
            [w, 0, -d],
            [w, h, -d],
            [-w, h, -d],
            [-w, 0, d],
            [w, 0, d],
            [w, h, d],
            [-w, h, d],
        ],
        dtype=np.float32,
    )


def _box_indices():
    # 12 triangles (two per face)
    return np.array(
        [
            0,
            1,
            2,
            2,
            3,
            0,  # back
            4,
            5,
            6,
            6,
            7,
            4,  # front
            0,
            4,
            7,
            7,
            3,
            0,  # left
            1,
            5,
            6,
            6,
            2,
            1,  # right
            3,
            2,
            6,
            6,
            7,
            3,  # top
            0,
            1,
            5,
            5,
            4,
            0,  # bottom
        ],
        dtype=np.uint16,
    )


def generate_glb(
    venue_dir: str,
    dimensions: Dict,
    walls: Optional[List[Dict]] = None,
    materials: Optional[Dict] = None,
) -> str:
    """
    Generate a GLB representing the room with dimensions, walls, floor, and ceiling.
    Uses layout walls when available; otherwise falls back to a simple box.
    Layout width/height/depth are in **feet** (same units as Three.js room box in the app).
    """
    width = float(dimensions.get("width", 40))
    height = float(dimensions.get("height", 9))
    depth = float(dimensions.get("depth", 40))

    materials = materials or {}
    floor_color = _hex_to_rgba(materials.get("floor", {}).get("color", "#c6b39e"))
    ceiling_color = _hex_to_rgba(materials.get("ceiling", {}).get("color", "#f5f5f5"))
    wall_color = [0.6, 0.6, 0.6, 1.0]

    all_vertices = []
    all_indices = []
    all_accessors = []
    all_buffer_views = []
    all_meshes = []
    all_nodes = []
    all_materials = []
    byte_offset = 0

    def add_mesh(verts: np.ndarray, inds: np.ndarray, color: List[float], name: str = ""):
        nonlocal byte_offset
        vbytes = verts.astype(np.float32).tobytes()
        ibytes = inds.astype(np.uint16).tobytes()
        chunk = vbytes + ibytes

        bv_pos = BufferView(buffer=0, byteOffset=byte_offset, byteLength=len(vbytes), target=34962)
        byte_offset += len(vbytes)
        bv_idx = BufferView(buffer=0, byteOffset=byte_offset, byteLength=len(ibytes), target=34963)
        byte_offset += len(ibytes)

        acc_pos = Accessor(
            bufferView=len(all_buffer_views),
            byteOffset=0,
            componentType=5126,
            count=len(verts),
            type="VEC3",
            min=[float(np.min(verts[:, i])) for i in range(3)],
            max=[float(np.max(verts[:, i])) for i in range(3)],
        )
        acc_idx = Accessor(
            bufferView=len(all_buffer_views) + 1,
            byteOffset=0,
            componentType=5123,
            count=len(inds),
            type="SCALAR",
        )

        mat = Material(
            pbrMetallicRoughness={
                "baseColorFactor": color,
                "metallicFactor": 0.0,
                "roughnessFactor": 0.9,
            }
        )
        mat_idx = len(all_materials)
        all_materials.append(mat)

        all_buffer_views.extend([bv_pos, bv_idx])
        all_accessors.extend([acc_pos, acc_idx])
        mesh = Mesh(primitives=[{
            "attributes": {"POSITION": len(all_accessors) - 2},
            "indices": len(all_accessors) - 1,
            "material": mat_idx,
        }])
        all_meshes.append(mesh)
        all_vertices.append(verts)
        all_indices.append(inds)
        return chunk

    buffer_chunks = []

    walls = walls or []
    if walls and any(w.get("coordinates") for w in walls):
        floor_y = -height / 2
        ceiling_y = height / 2
        for wall in walls:
            coords = wall.get("coordinates")
            if not coords or len(coords) != 4:
                continue
            x1, y1, x2, y2 = coords
            x1w = (x1 / 100.0) * width - width / 2
            z1w = (y1 / 100.0) * depth - depth / 2
            x2w = (x2 / 100.0) * width - width / 2
            z2w = (y2 / 100.0) * depth - depth / 2
            wall_len = np.sqrt((x2w - x1w) ** 2 + (z2w - z1w) ** 2)
            if wall_len < 0.1:
                continue
            cx = (x1w + x2w) / 2
            cz = (z1w + z2w) / 2
            angle = np.arctan2(-(z2w - z1w), x2w - x1w)
            c, s = np.cos(angle), np.sin(angle)
            hw, hh = wall_len / 2, height / 2
            verts = np.array([
                [cx - hw * c, floor_y, cz + hw * s],
                [cx + hw * c, floor_y, cz - hw * s],
                [cx + hw * c, ceiling_y, cz - hw * s],
                [cx - hw * c, ceiling_y, cz + hw * s],
            ], dtype=np.float32)
            inds = np.array([0, 1, 2, 0, 2, 3], dtype=np.uint16)
            buffer_chunks.append(add_mesh(verts, inds, wall_color, "wall"))
    else:
        vertices = _box_vertices(width, height, depth)
        indices = _box_indices()
        buffer_chunks.append(add_mesh(vertices, indices, wall_color, "room"))

    floor_y = -height / 2
    ceiling_y = height / 2
    fv, fi = _plane_vertices(width, depth)
    fv[:, 1] = floor_y
    buffer_chunks.append(add_mesh(fv, fi, floor_color, "floor"))
    cv, ci = _plane_vertices(width, depth)
    cv[:, 1] = ceiling_y
    ci_ceiling = np.array([0, 2, 1, 0, 1, 3], dtype=np.uint16)
    buffer_chunks.append(add_mesh(cv, ci_ceiling, ceiling_color, "ceiling"))

    buffer_data = b"".join(buffer_chunks)
    buffer = Buffer(byteLength=len(buffer_data))

    for i, mesh in enumerate(all_meshes):
        all_nodes.append(Node(mesh=i))

    scene = Scene(nodes=list(range(len(all_nodes))))

    gltf = GLTF2(
        asset=Asset(version="2.0"),
        scenes=[scene],
        scene=0,
        nodes=all_nodes,
        meshes=all_meshes,
        materials=all_materials,
        buffers=[buffer],
        bufferViews=all_buffer_views,
        accessors=all_accessors,
    )
    gltf.set_binary_blob(buffer_data)

    os.makedirs(venue_dir, exist_ok=True)
    glb_path = os.path.join(venue_dir, "venue.glb")
    gltf.save(glb_path)
    return glb_path

