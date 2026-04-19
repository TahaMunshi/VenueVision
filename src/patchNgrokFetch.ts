/**
 * Cross-origin Vercel → ngrok: ngrok may return an HTML interstitial unless
 * requests include ngrok-skip-browser-warning.
 *
 * - fetch(): patched below.
 * - Three.js GLTFLoader / FileLoader: use XMLHttpRequest — patched below.
 * - TextureLoader: uses <img> — cannot set headers; use resolveTextureUrlForNgrok() + blob URL.
 */
import { getApiBaseUrl } from './utils/api'

const FLAG = '__venuevisionNgrokNetworkBypass'

export function installNgrokNetworkBypass(): void {
  const w = window as unknown as Record<string, boolean>
  if (w[FLAG]) return
  w[FLAG] = true

  const base = getApiBaseUrl()
  if (!base || !/ngrok/i.test(base)) return

  const origFetch = window.fetch.bind(window)
  window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
    if (typeof input === 'string' && input.startsWith(base)) {
      const headers = new Headers(init?.headers)
      if (!headers.has('ngrok-skip-browser-warning')) {
        headers.set('ngrok-skip-browser-warning', '69420')
      }
      return origFetch(input, { ...init, headers })
    }
    return origFetch(input, init)
  }

  const origOpen = XMLHttpRequest.prototype.open
  XMLHttpRequest.prototype.open = function (
    this: XMLHttpRequest,
    method: string,
    url: string | URL,
    ...rest: unknown[]
  ) {
    const urlStr = typeof url === 'string' ? url : url.href
    // @ts-expect-error three.js passes async flag etc.
    const ret = origOpen.call(this, method, url, ...rest)
    try {
      if (urlStr.startsWith(base)) {
        this.setRequestHeader('ngrok-skip-browser-warning', '69420')
      }
    } catch {
      /* ignore */
    }
    return ret
  }
}
