/**
 * Coordinate System Helper
 * 
 * This file ensures perfect synchronization between the 2D Floor Planner and 3D Viewer.
 * 
 * **2D Floor Planner Coordinate System:**
 * - Canvas origin (0, 0) is at TOP-LEFT
 * - X-axis goes from LEFT to RIGHT (0 to roomWidth)
 * - Y-axis goes from TOP to BOTTOM (0 to roomDepth)
 * - Assets are positioned by their TOP-LEFT corner (x, y)
 * - Asset footprint: from (x, y) to (x + width, y + depth)
 * - Wall coordinates: [x1, y1, x2, y2] where (x1,y1) is start point, (x2,y2) is end point
 * 
 * **3D Viewer Coordinate System (Three.js):**
 * - World origin (0, 0, 0) is at the CENTER of the floor
 * - X-axis: LEFT (-) to RIGHT (+) [matches 2D x-axis]
 * - Y-axis: DOWN (-) to UP (+) [floor is at -height/2]
 * - Z-axis: BACK (-) to FRONT (+) [NO NEGATION: this is the key difference!]
 * - Asset group position is at the CENTER of the 3D bounding box
 * 
 * **Conversion Formula:**
 * From 2D planner (normalized 0-100) to 3D world coordinates:
 * - worldX = (x_norm / 100) * roomWidth - roomWidth/2
 * - worldZ = (y_norm / 100) * roomDepth - roomDepth/2
 * 
 * NOTE: Do NOT negate Z-axis. The 2D y-axis direction (top to bottom on canvas)
 * corresponds correctly to the 3D z-axis direction (back to front in world).
 * A wall at y=0 (top of canvas) should be at z=-depth/2 (back of room).
 * A wall at y=100 (bottom of canvas) should be at z=depth/2 (front of room).
 */

export interface Asset2D {
  id: string
  type: string
  file: string
  width: number // meters
  depth: number // meters
  x: number // planner X (left edge in meters)
  y: number // planner Y (top edge in meters)
  rotation: number // degrees
}

export interface Room {
  width: number // meters
  depth: number // meters
  height: number // meters
}

/**
 * Convert 2D floor planner coordinates to 3D world coordinates
 * @param asset - Asset positioned in 2D planner
 * @param room - Room dimensions
 * @returns Object with worldX, worldZ, worldY (floor level)
 */
export function convertAssetTo3D(asset: Asset2D, room: Room) {
  // Calculate center of asset in 2D planner space
  const centerX2D = asset.x + asset.width / 2
  const centerY2D = asset.y + asset.depth / 2

  // Convert to 3D world coordinates (room center is origin)
  const worldX = centerX2D - room.width / 2
  const worldZ = centerY2D - room.depth / 2
  const floorY = -room.height / 2

  return { worldX, worldZ, floorY }
}

/**
 * Convert 3D world coordinates back to 2D floor planner coordinates
 * @param worldX - World X coordinate
 * @param worldZ - World Z coordinate
 * @param room - Room dimensions
 * @param width - Asset width (for center-to-topleft conversion)
 * @param depth - Asset depth (for center-to-topleft conversion)
 * @returns Object with x, y (top-left corner in planner space)
 */
export function convertAssetTo2D(
  worldX: number,
  worldZ: number,
  room: Room,
  width: number,
  depth: number
) {
  // Convert from world center back to 2D center
  const centerX2D = worldX + room.width / 2
  const centerY2D = worldZ + room.depth / 2

  // Convert from center to top-left corner
  const x = centerX2D - width / 2
  const y = centerY2D - depth / 2

  return { x, y }
}

/**
 * Validate that asset is within room bounds
 */
export function isAssetInBounds(asset: Asset2D, room: Room): boolean {
  return (
    asset.x >= 0 &&
    asset.y >= 0 &&
    asset.x + asset.width <= room.width &&
    asset.y + asset.depth <= room.depth
  )
}

/**
 * Check collision between two assets in 2D space
 */
export function checkAssetCollision(
  asset1: Asset2D,
  asset2: Asset2D,
  spacing: number = 0.5
): boolean {
  const a1Left = asset1.x - spacing / 2
  const a1Right = asset1.x + asset1.width + spacing / 2
  const a1Top = asset1.y - spacing / 2
  const a1Bottom = asset1.y + asset1.depth + spacing / 2

  const a2Left = asset2.x - spacing / 2
  const a2Right = asset2.x + asset2.width + spacing / 2
  const a2Top = asset2.y - spacing / 2
  const a2Bottom = asset2.y + asset2.depth + spacing / 2

  return !(a1Right <= a2Left || a1Left >= a2Right || a1Bottom <= a2Top || a1Top >= a2Bottom)
}

/**
 * Snap asset position to grid
 */
export function snapToGrid(value: number, gridSize: number = 0.5): number {
  return Math.round(value / gridSize) * gridSize
}

/**
 * Format distance for display
 */
export function formatDistance(meters: number, decimals: number = 2): string {
  return meters.toFixed(decimals) + 'm'
}
