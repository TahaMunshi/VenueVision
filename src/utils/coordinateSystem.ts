/**
 * Coordinate System Helper
 *
 * **Room length unit:** feet (see `src/constants/roomUnits.ts`). All `width`, `depth`, `height`,
 * and planner `x`, `y` for room placement are in **feet** unless noted otherwise.
 *
 * **2D Floor Planner Coordinate System:**
 * - Canvas origin (0, 0) is at TOP-LEFT
 * - X-axis goes from LEFT to RIGHT (0 to roomWidthFt)
 * - Y-axis goes from TOP to BOTTOM (0 to roomDepthFt)
 * - Assets are positioned by their TOP-LEFT corner (x, y) in feet
 * - Wall coordinates: [x1, y1, x2, y2] normalized 0-100 in planner space
 *
 * **3D Viewer Coordinate System (Three.js):**
 * - World origin (0, 0, 0) is at the CENTER of the floor
 * - 1 world unit = 1 foot
 * - Y-axis: floor at -heightFt/2, ceiling at +heightFt/2
 */

import { ROOM_LENGTH_UNIT } from '../constants/roomUnits'

export interface Asset2D {
  id: string
  type: string
  file: string
  width: number // feet (footprint)
  depth: number // feet
  x: number // planner X (left edge in feet)
  y: number // planner Y (top edge in feet)
  rotation: number // degrees
}

export interface Room {
  width: number // feet
  depth: number // feet
  height: number // feet (ceiling height)
}

/**
 * Convert 2D floor planner coordinates to 3D world coordinates
 */
export function convertAssetTo3D(asset: Asset2D, room: Room) {
  const centerX2D = asset.x + asset.width / 2
  const centerY2D = asset.y + asset.depth / 2

  const worldX = centerX2D - room.width / 2
  const worldZ = centerY2D - room.depth / 2
  const floorY = -room.height / 2

  return { worldX, worldZ, floorY }
}

export function convertAssetTo2D(
  worldX: number,
  worldZ: number,
  room: Room,
  width: number,
  depth: number
) {
  const centerX2D = worldX + room.width / 2
  const centerY2D = worldZ + room.depth / 2

  const x = centerX2D - width / 2
  const y = centerY2D - depth / 2

  return { x, y }
}

export function isAssetInBounds(asset: Asset2D, room: Room): boolean {
  return (
    asset.x >= 0 &&
    asset.y >= 0 &&
    asset.x + asset.width <= room.width &&
    asset.y + asset.depth <= room.depth
  )
}

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

/** Snap to grid in feet */
export function snapToGrid(valueFt: number, gridFt: number = 0.25): number {
  return Math.round(valueFt / gridFt) * gridFt
}

/** @deprecated Use formatLengthFt from roomUnits or this with ROOM_LENGTH_UNIT */
export function formatDistance(feet: number, decimals: number = 2): string {
  return feet.toFixed(decimals) + ROOM_LENGTH_UNIT
}
