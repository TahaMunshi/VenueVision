import os
from typing import Dict, List, Optional

from pygltflib import GLTF2, Scene, Node, Mesh, Buffer, BufferView, Accessor, Asset
import numpy as np


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
) -> str:
    """
    Generate a simple box-based GLB representing the room with given dimensions.
    This is a minimal placeholder export without textures; intended to be replaced
    with richer geometry later.
    """
    width = float(dimensions.get("width", 20))
    height = float(dimensions.get("height", 8))
    depth = float(dimensions.get("depth", 20))

    vertices = _box_vertices(width, height, depth)
    indices = _box_indices()

    # Flatten vertex data
    vertex_bytes = vertices.astype(np.float32).tobytes()
    index_bytes = indices.astype(np.uint16).tobytes()

    buffer_data = vertex_bytes + index_bytes

    buffer = Buffer(byteLength=len(buffer_data))
    buffer_view_positions = BufferView(
        buffer=0, byteOffset=0, byteLength=len(vertex_bytes), target=34962
    )  # ARRAY_BUFFER
    buffer_view_indices = BufferView(
        buffer=0,
        byteOffset=len(vertex_bytes),
        byteLength=len(index_bytes),
        target=34963,
    )  # ELEMENT_ARRAY_BUFFER

    accessor_positions = Accessor(
        bufferView=0,
        byteOffset=0,
        componentType=5126,  # FLOAT
        count=len(vertices),
        type="VEC3",
        max=[float(np.max(vertices[:, 0])), float(np.max(vertices[:, 1])), float(np.max(vertices[:, 2]))],
        min=[float(np.min(vertices[:, 0])), float(np.min(vertices[:, 1])), float(np.min(vertices[:, 2]))],
    )
    accessor_indices = Accessor(
        bufferView=1,
        byteOffset=0,
        componentType=5123,  # UNSIGNED_SHORT
        count=len(indices),
        type="SCALAR",
    )

    mesh = Mesh()
    mesh.primitives = [{"attributes": {"POSITION": 0}, "indices": 1}]

    node = Node(mesh=0)
    scene = Scene(nodes=[0])

    gltf = GLTF2(
        asset=Asset(version="2.0"),
        scenes=[scene],
        scene=0,
        nodes=[node],
        meshes=[mesh],
        buffers=[buffer],
        bufferViews=[buffer_view_positions, buffer_view_indices],
        accessors=[accessor_positions, accessor_indices],
    )

    # Embed buffer
    gltf.set_binary_blob(buffer_data)

    os.makedirs(venue_dir, exist_ok=True)
    glb_path = os.path.join(venue_dir, "venue.glb")
    gltf.save(glb_path)
    return glb_path

