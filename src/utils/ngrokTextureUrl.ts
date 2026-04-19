/**
 * TextureLoader uses <img> internally — it cannot send ngrok-skip-browser-warning.
 * Fetch the bytes with fetch() (patched) and return a blob: URL for Three.js.
 */
import { getApiBaseUrl } from './api'

export async function resolveTextureUrlForNgrok(fullUrl: string): Promise<string> {
  const base = getApiBaseUrl().replace(/\/+$/, '')
  if (!base || !fullUrl.startsWith(base) || !/ngrok/i.test(base)) {
    return fullUrl
  }
  const res = await fetch(fullUrl, {
    headers: { 'ngrok-skip-browser-warning': '69420' },
    mode: 'cors',
    credentials: 'omit',
  })
  if (!res.ok) {
    throw new Error(`Texture fetch failed: ${res.status}`)
  }
  const blob = await res.blob()
  return URL.createObjectURL(blob)
}
