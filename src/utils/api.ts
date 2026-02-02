// Shared API base URL detection used across mobile, planner, and viewer flows.
export const getApiBaseUrl = () => {
  const { hostname, protocol, port } = window.location

  // Ngrok or similar tunnels: use same host (Flask serves API + frontend)
  if (
    hostname.includes('ngrok') ||
    hostname.includes('ngrok-free') ||
    hostname.includes('ngrok.io') ||
    hostname.includes('ngrok.app')
  ) {
    return `${protocol}//${hostname}`
  }

  // Respect explicit env override when not on ngrok
  const envUrl = import.meta.env.VITE_API_BASE_URL
  if (envUrl) {
    return envUrl
  }

  // Non-localhost hosts (LAN IP or custom domain)
  if (hostname !== 'localhost' && hostname !== '127.0.0.1') {
    const isLan =
      /^192\.168\.|^10\.|^172\.(1[6-9]|2[0-9]|3[01])\./.test(hostname)
    if (isLan) {
      return `${protocol}//${hostname}:5000`
    }
    return `${protocol}//${hostname}${port ? `:${port}` : ''}`
  }

  // Default local dev
  return 'http://localhost:5000'
}

