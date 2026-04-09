/**
 * Single source of truth: venue / floor-plan / 3D room box use **feet** (world units = feet).
 * User-generated 3D assets from Tripo may still expose width_m / height_m in **meters** — convert with metersToFeet().
 */
export const ROOM_LENGTH_UNIT = 'ft' as const

/** Canvas scale: one foot spans this many CSS pixels on the floor planner. */
export const PIXELS_PER_FOOT = 15

/** Snap grid: quarter-foot steps on the planner (convert to pixels). */
export const GRID_STEP_FT = 0.25

export const GRID_SIZE_PX = Math.max(1, Math.round(PIXELS_PER_FOOT * GRID_STEP_FT))

/** 1 ft = 0.3048 m */
export const METERS_PER_FOOT = 0.3048

export function feetToMeters(ft: number): number {
  return ft * METERS_PER_FOOT
}

export function metersToFeet(m: number): number {
  return m / METERS_PER_FOOT
}

export function formatLengthFt(value: number, decimals = 2): string {
  return `${value.toFixed(decimals)} ${ROOM_LENGTH_UNIT}`
}
