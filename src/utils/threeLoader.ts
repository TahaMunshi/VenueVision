/**
 * Loads Three.js r128 + OrbitControls + GLTFLoader from CDN once and caches the promise.
 * Avoids duplicate script tags when navigating between planner, viewer, and asset library.
 */
let loadPromise: Promise<void> | null = null

function scriptsReady(): boolean {
  if (typeof window === 'undefined') return false
  const w = window as unknown as { THREE?: { OrbitControls?: unknown; GLTFLoader?: unknown } }
  return !!(w.THREE && w.THREE.OrbitControls && w.THREE.GLTFLoader)
}

export function loadThreeBundle(): Promise<void> {
  if (typeof window === 'undefined') {
    return Promise.resolve()
  }
  if (scriptsReady()) {
    return Promise.resolve()
  }
  if (loadPromise) {
    return loadPromise
  }

  loadPromise = new Promise((resolve, reject) => {
    const loadScript = (src: string) =>
      new Promise<void>((res, rej) => {
        const s = document.createElement('script')
        s.src = src
        s.async = true
        s.onload = () => res()
        s.onerror = () => rej(new Error(`Failed to load script: ${src}`))
        document.head.appendChild(s)
      })

    loadScript('https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js')
      .then(() =>
        loadScript(
          'https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/controls/OrbitControls.js'
        )
      )
      .then(() =>
        loadScript(
          'https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/loaders/GLTFLoader.js'
        )
      )
      .then(() => resolve())
      .catch((e) => {
        loadPromise = null
        reject(e)
      })
  })

  return loadPromise
}
