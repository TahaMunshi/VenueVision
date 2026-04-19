/**
 * Vercel (or any other origin) → ngrok API: ngrok may return an HTML interstitial
 * unless requests include this header. Browser fetch can send it; <img> cannot (see ngrok docs).
 */
import { getApiBaseUrl } from './utils/api'

export function installNgrokFetchBypass(): void {
  const base = getApiBaseUrl()
  if (!base || !/ngrok/i.test(base)) return

  const orig = window.fetch.bind(window)
  window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
    if (typeof input === 'string' && input.startsWith(base)) {
      const headers = new Headers(init?.headers)
      if (!headers.has('ngrok-skip-browser-warning')) {
        headers.set('ngrok-skip-browser-warning', '69420')
      }
      return orig(input, { ...init, headers })
    }
    return orig(input, init)
  }
}
