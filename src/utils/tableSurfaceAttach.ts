/** Planner + 3D viewer: snap small decor to table tops using 2D center and footprint. */

export const TABLE_PLAN_EPS = 1e-3

/** Props: match type slugs / paths (loose — used for wantsTableTopDecor). */
const TABLETOP_DECOR_LOOSE_RE =
  /candle|tealight|tea_light|votive|plant|cactus|succulent|planter|flower|potted|\bpot\b|vase|figurine|ornament|centerpiece|mug|cup|bowl|basket/i

/**
 * Stricter: used only to block the *compact footprint* table heuristic so a 2×2 plant
 * is not mistaken for a coffee table. Avoids substrings like "plant" inside unrelated words
 * where possible, and does not treat every file path as decor.
 */
function looksLikeCompactTabletopProp(a: { file?: string; type?: string }): boolean {
  const t = String(a.type || '').toLowerCase()
  if (
    /cactus|potted_cactus|potted_plant|house_?plant|small_?plant|table_?plant|planter|tealight|votive|candle|succulent/i.test(
      t
    )
  )
    return true
  const base = String(a.file || '')
    .toLowerCase()
    .split(/[/\\]/)
    .pop() || ''
  if (
    /\b(cactus|succulent|planter|figurine|ornament|tealight|votive|flowerpot|flower_pot|potted_plant|houseplant)\b/i.test(
      base
    )
  )
    return true
  if (/table_?plant|(^|_)plant(_|\.|$)/i.test(base)) return true
  return false
}

/** Path/basename suggests a table mesh (not a plant pot). Checked before decor false-positives. */
function fileSuggestsTableFurniture(fileLower: string): boolean {
  return /\b(coffee|dining|side|console|kitchen|end|round|wood|glass)[_-]?table\b|\btable[._-]?(coffee|wood|round|dining|glass)\b|\bround[._-]?table\b|asset_table\.glb$/i.test(
    fileLower
  )
}

export function isTableAssetFile(file: string): boolean {
  return file === 'asset_table.glb' || String(file).toLowerCase().endsWith('/asset_table.glb')
}

/**
 * Any layout row that should act as a horizontal support (built-in table, named table/desk, or footprint).
 */
export function isLayoutTableSupport(a: {
  file?: string
  type?: string
  layer?: string
  width?: number
  depth?: number
  /** User-flagged in Asset Library: acts like the default table for snapping decor on top. */
  is_table?: boolean
}): boolean {
  if (a.is_table === true || (a as { isTable?: boolean }).isTable === true) return true

  const file = String(a.file || '')
  const fileLower = file.toLowerCase()
  const base = fileLower.split(/[/\\]/).pop() || fileLower
  if (base === 'asset_table.glb') return true

  const layer = a.layer ?? 'surface'
  if (layer === 'floor' || layer === 'ceiling') return false

  /** Types like `table_plant` start with `table_` but are decor, not a support surface. */
  if (looksLikeCompactTabletopProp(a)) return false

  const t = String(a.type || '').toLowerCase()
  if (t === 'table') return true
  if (t.endsWith('_table') && !t.includes('table_lamp') && !t.includes('tablet')) return true
  if (t.startsWith('table_') && !t.startsWith('table_lamp')) return true
  if (/(^|_)desk($|_)/.test(t) || t.endsWith('_desk')) return true

  if (fileSuggestsTableFurniture(fileLower)) return true
  if (/\bcoffee\b/.test(t) && /\btable\b/.test(t)) return true
  if (/\bround\b/.test(t) && /\btable\b/.test(t)) return true

  const w = Number(a.width) || 0
  const d = Number(a.depth) || 0
  const area = w * d
  const mn = Math.min(w, d)
  const mx = Math.max(w, d)
  const ratio = mn > 0 ? mx / mn : 999

  if (/(^|_)coffee_table($|_)|^coffee_table|(^|_)side_table($|_)|(^|_)round_table($|_)/.test(t)) return true

  /**
   * Small coffee / side tables (~1.4–2.2 ft per side). Do not use global "decor" regex here —
   * it matched substrings inside table filenames and blocked real coffee tables.
   */
  if (
    !/(^|_)chair($|_)|stool|ottoman|sofa|bench|bed/i.test(t) &&
    !looksLikeCompactTabletopProp(a) &&
    area >= 2 &&
    area <= 22 &&
    mn >= 1 &&
    mx <= 6 &&
    ratio <= 2.75
  ) {
    return true
  }

  /** Dining / large custom tables */
  if (area >= 12 && mn >= 2.5 && mx >= 4) return true

  return false
}

/** Files that always sit on a table when centered over one (matches floor planner catalog). */
export const PLACE_ON_TABLE_FILES = new Set<string>(['blue_vase.glb'])

/**
 * True if this piece should use a table’s top surface when its center lies over a table.
 */
export function wantsTableTopDecor(asset: {
  file?: string
  type?: string
  layer?: string
  width?: number
  depth?: number
  placeOnTable?: boolean
  place_on_table?: boolean
  is_table?: boolean
}): boolean {
  if (asset.placeOnTable || asset.place_on_table) return true

  const file = String(asset.file || '')
  const base = file.split(/[/\\]/).pop() || file
  if (PLACE_ON_TABLE_FILES.has(file) || PLACE_ON_TABLE_FILES.has(base)) return true
  if (TABLETOP_DECOR_LOOSE_RE.test(file) || TABLETOP_DECOR_LOOSE_RE.test(String(asset.type || ''))) return true

  if (isLayoutTableSupport(asset)) return false

  const layer = asset.layer ?? 'surface'
  if (layer === 'ceiling' || layer === 'floor') return false
  if (isTableAssetFile(file) || file === 'chandelier.glb' || file === 'rug.glb') return false
  const t = String(asset.type || '').toLowerCase()
  if (t.includes('chandelier')) return false
  const w = Number(asset.width) || 0
  const d = Number(asset.depth) || 0
  if (w <= 0 || d <= 0) return false
  return w * d <= 36 && Math.min(w, d) <= 6
}

export type TableAttachLayout = {
  id?: string
  file?: string
  type?: string
  layer?: string
  width?: number
  depth?: number
  is_table?: boolean
  x: number
  y: number
}

export function findTableUnderDecorCenter<T extends TableAttachLayout>(decor: T, allAssets: T[]): T | null {
  const dx = Number(decor.x) || 0
  const dy = Number(decor.y) || 0
  const dw = Number(decor.width) || 0
  const dd = Number(decor.depth) || 0
  const cx = dx + dw / 2
  const cy = dy + dd / 2
  const inside: T[] = []
  for (const t of allAssets) {
    if (!isLayoutTableSupport(t)) continue
    if (decor.id != null && t.id != null && t.id === decor.id) continue
    const tx = Number(t.x) || 0
    const ty = Number(t.y) || 0
    const tw = Number(t.width) || 0
    const td = Number(t.depth) || 0
    if (
      cx >= tx - TABLE_PLAN_EPS &&
      cx <= tx + tw + TABLE_PLAN_EPS &&
      cy >= ty - TABLE_PLAN_EPS &&
      cy <= ty + td + TABLE_PLAN_EPS
    ) {
      inside.push(t)
    }
  }
  if (inside.length === 0) return null
  return inside.reduce((best, t) =>
    Number(t.width) * Number(t.depth) < Number(best.width) * Number(best.depth) ? t : best
  )
}

export function tableAttachOffsets(
  decor: Pick<TableAttachLayout, 'x' | 'y' | 'width' | 'depth'>,
  table: Pick<TableAttachLayout, 'x' | 'y' | 'width' | 'depth'>
) {
  const dw = Number(decor.width) || 0
  const dd = Number(decor.depth) || 0
  const cxM = (Number(decor.x) || 0) + dw / 2
  const cyM = (Number(decor.y) || 0) + dd / 2
  const tcx = (Number(table.x) || 0) + (Number(table.width) || 0) / 2
  const tcy = (Number(table.y) || 0) + (Number(table.depth) || 0) / 2
  const offsetX = cxM - tcx
  const offsetY = cyM - tcy
  return {
    offsetX,
    offsetY,
    x: tcx + offsetX - dw / 2,
    y: tcy + offsetY - dd / 2
  }
}
