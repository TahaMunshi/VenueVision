import { useCallback, useEffect, useRef, useState, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import './MobileCapture.css'
import MiniMap, { type WallSegment } from '../../components/MiniMap'
import ScannerOverlay from '../../components/ScannerOverlay'
import { getApiBaseUrl } from '../../utils/api'

// NOTE: To access the backend from your phone on the same Wi‑Fi, set VITE_API_BASE_URL in the project .env to your PC's LAN IP, e.g. http://192.168.1.42:5000

// Get API URL at module load (will be overridden in component if needed)
let API_BASE_URL = getApiBaseUrl()

type Toast = {
  message: string
  type: 'success' | 'error'
}

type WallRegion = {
  id: string
  name: string
  x: number
  y: number
  width: number
  height: number
}

type ProgressState = {
  total_walls: number
  completed_walls: string[]
  current_target: { id: string; name: string } | null
  is_complete: boolean
  walls: WallSegment[]
  floor_plan_url?: string | null
  wall_regions?: WallRegion[]
  capture_requirements?: Record<string, { required_segments: number; captured_segments: number }>
}

const MobileCapture = () => {
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const navigate = useNavigate()

  const { venueId } = useParams<{ venueId: string }>()

  const [isUploading, setIsUploading] = useState(false)
  const [toast, setToast] = useState<Toast | null>(null)
  const [alertMessage, setAlertMessage] = useState<string | null>(null)
  const [showCheck, setShowCheck] = useState(false)
  const [cameraError, setCameraError] = useState<string | null>(null)
  const [progress, setProgress] = useState<ProgressState | null>(null)
  const [currentWall, setCurrentWall] = useState<WallSegment | null>(null)
  const [wallImages, setWallImages] = useState<Record<string, string>>({})
  const [videoReady, setVideoReady] = useState(false)
  const [loadingTimeout, setLoadingTimeout] = useState(false)
  const [retakingWallId, setRetakingWallId] = useState<string | null>(null) // Track which wall is being retaken

  // All refs must be declared at the top level
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const wallSetRef = useRef<string | null>(null)

  const targetVenue = useMemo(() => venueId ?? 'venue-unknown', [venueId])

  const determineCurrentWall = useCallback((data: ProgressState): WallSegment | null => {
    if (!data.walls || data.walls.length === 0) {
      console.warn('No walls found in progress data')
      return null
    }
    
    if (data.current_target) {
      const next = data.walls.find((wall) => wall.id === data.current_target?.id)
      if (next) return next
    }
    
    // Find first incomplete wall
    const incompleteWall = data.walls.find((wall) => !data.completed_walls.includes(wall.id))
    return incompleteWall ?? null
  }, [])

  const fetchProgress = useCallback(async () => {
    if (!venueId) {
      console.error('No venueId provided')
      return
    }
    
    // Re-detect API URL at runtime to ensure we have the correct URL
    const currentApiUrl = getApiBaseUrl()
    
    try {
      const url = `${currentApiUrl}/api/v1/venue/${venueId}/progress`
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      })

      if (!response.ok) {
        const errorText = await response.text()
        console.error('[MobileCapture] Failed to load capture progress:', response.status, errorText)
        
        // If it's a 404 or 500, use default values
        if (response.status === 404 || response.status >= 500) {
          console.warn('[MobileCapture] Using default progress values due to API error')
          const defaultProgress: ProgressState = {
            total_walls: 4,
            completed_walls: [],
            current_target: { id: 'wall_north', name: 'North Wall' },
            is_complete: false,
            walls: [
              { id: 'wall_north', name: 'North Wall', coordinates: [10, 10, 90, 10] },
              { id: 'wall_east', name: 'East Wall', coordinates: [90, 10, 90, 90] },
              { id: 'wall_south', name: 'South Wall', coordinates: [90, 90, 10, 90] },
              { id: 'wall_west', name: 'West Wall', coordinates: [10, 90, 10, 10] },
            ],
            floor_plan_url: null,
            wall_regions: []
          }
          setProgress(defaultProgress)
          setCurrentWall(defaultProgress.walls[0])
          return
        }
        
        throw new Error(`Failed to load capture progress: ${response.status}`)
      }
      
      const data = (await response.json()) as ProgressState

      if (!data || !data.walls) {
        console.error('[MobileCapture] Invalid progress data structure:', data)
        throw new Error('Invalid progress data structure')
      }
      
      // Add coordinates to walls if missing (for MiniMap compatibility)
      const wallsWithCoords: WallSegment[] = data.walls.map((wall, index) => {
        if ('coordinates' in wall && Array.isArray((wall as any).coordinates)) {
          return wall as WallSegment
        }
        // Default coordinates for 4 walls (North, East, South, West)
        const defaultCoords: [number, number, number, number][] = [
          [10, 10, 90, 10], // North
          [90, 10, 90, 90], // East
          [90, 90, 10, 90], // South
          [10, 90, 10, 10], // West
        ]
        return {
          id: wall.id,
          name: wall.name,
          coordinates: defaultCoords[index % 4] || [10, 10, 90, 10]
        } as WallSegment
      })
      
      const dataWithCoords: ProgressState = {
        total_walls: data.total_walls,
        completed_walls: data.completed_walls,
        current_target: data.current_target,
        is_complete: data.is_complete,
        walls: wallsWithCoords,
        floor_plan_url: data.floor_plan_url || null,
        wall_regions: data.wall_regions || [],
        capture_requirements: data.capture_requirements || {}
      }
      
      setProgress(dataWithCoords)
      const wall = determineCurrentWall(dataWithCoords)
      setCurrentWall(wall)

      // Preload wall images for review
      try {
        const imagesRes = await fetch(`${currentApiUrl}/api/v1/venue/${venueId}/wall-images`)
        const imagesData = await imagesRes.json()
        if (imagesData.status === 'success' && imagesData.wall_images) {
          setWallImages(imagesData.wall_images)
        }
      } catch (err) {
        console.warn('[MobileCapture] Could not load wall images for review')
      }
    } catch (error) {
      console.error('[MobileCapture] Unable to fetch venue progress:', error)
      
      // On network errors, use default values so user can still use the app
      if (error instanceof TypeError && (error.message.includes('fetch') || error.message.includes('Failed to fetch'))) {
        console.warn('[MobileCapture] Network error detected, using default progress values')
        const defaultProgress: ProgressState = {
          total_walls: 4,
          completed_walls: [],
          current_target: { id: 'wall_north', name: 'North Wall' },
          is_complete: false,
          walls: [
            { id: 'wall_north', name: 'North Wall', coordinates: [10, 10, 90, 10] },
            { id: 'wall_east', name: 'East Wall', coordinates: [90, 10, 90, 90] },
            { id: 'wall_south', name: 'South Wall', coordinates: [90, 90, 10, 90] },
            { id: 'wall_west', name: 'West Wall', coordinates: [10, 90, 10, 10] },
          ],
          floor_plan_url: null,
          wall_regions: []
        }
        setProgress(defaultProgress)
        setCurrentWall(defaultProgress.walls[0])
        // Don't show alert for network errors - just use defaults silently
        // The app will work with default values
      } else {
        // Only show alert for non-network errors
        const errorMsg = error instanceof Error ? error.message : 'Unknown error'
        console.error('[MobileCapture] API error:', errorMsg)
        // Still set defaults so app can work
        const defaultProgress: ProgressState = {
          total_walls: 4,
          completed_walls: [],
          current_target: { id: 'wall_north', name: 'North Wall' },
          is_complete: false,
          walls: [
            { id: 'wall_north', name: 'North Wall', coordinates: [10, 10, 90, 10] },
            { id: 'wall_east', name: 'East Wall', coordinates: [90, 10, 90, 90] },
            { id: 'wall_south', name: 'South Wall', coordinates: [90, 90, 10, 90] },
            { id: 'wall_west', name: 'West Wall', coordinates: [10, 90, 10, 10] },
          ],
          floor_plan_url: null,
          wall_regions: []
        }
        setProgress(defaultProgress)
        setCurrentWall(defaultProgress.walls[0])
      }
    }
  }, [determineCurrentWall, venueId])

  useEffect(() => {
    let cancelled = false

    const startCamera = async () => {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        setCameraError('Camera API not supported on this device.')
        return
      }

      // First, stop any existing stream to release the camera
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop())
        streamRef.current = null
      }

      // Also clear video element
      if (videoRef.current) {
        videoRef.current.srcObject = null
      }

      // Small delay to ensure camera is released
      await new Promise(resolve => setTimeout(resolve, 100))

      try {
        // More flexible camera constraints to avoid OverconstrainedError
        // On mobile, be even more flexible
        const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent)
        
        const constraints: MediaStreamConstraints = isMobile
          ? {
              // Very flexible constraints for mobile
              video: {
                facingMode: 'environment',
                // Let mobile choose the best resolution
              },
              audio: false
            }
          : {
              // Desktop can handle more specific constraints
              video: {
                facingMode: 'environment',
                width: { ideal: 1920, min: 640 },
                height: { ideal: 1080, min: 480 }
              },
              audio: false
            }

        const stream = await navigator.mediaDevices.getUserMedia(constraints)
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop())
          return
        }

        streamRef.current = stream

        setTimeout(() => {
          if (videoRef.current) {
            videoRef.current.srcObject = stream

            videoRef.current.onloadedmetadata = () => {
              setVideoReady(true)
              const playPromise = videoRef.current?.play()
              if (playPromise) {
                playPromise
                  .then(() => setVideoReady(true))
                  .catch(err => {
                    console.warn('[MobileCapture] Play failed:', err)
                    // Try again after a short delay
                    setTimeout(() => {
                      videoRef.current?.play()
                        .then(() => setVideoReady(true))
                        .catch(e => console.error('[MobileCapture] Retry play failed:', e))
                    }, 100)
                  })
              }
            }
            
            videoRef.current.onplay = () => setVideoReady(true)
            videoRef.current.onplaying = () => setVideoReady(true)
            
            videoRef.current.onerror = (e) => {
              console.error('[MobileCapture] Video element error:', e, videoRef.current?.error)
              setCameraError('Video playback error. Please refresh the page.')
            }
            
            // Try to play immediately
            const playPromise = videoRef.current.play()
            if (playPromise) {
              playPromise.catch(err => {
                console.warn('[MobileCapture] Initial play attempt:', err.message)
              })
            }
          } else {
            console.error('[MobileCapture] videoRef.current is null after timeout!')
            // Retry setting stream after another delay
            setTimeout(() => {
              if (videoRef.current && streamRef.current) {
                videoRef.current.srcObject = streamRef.current
                videoRef.current.play().catch(e => console.warn('[MobileCapture] Retry play:', e))
              }
            }, 500)
          }
        }, 100)
      } catch (error) {
        console.error('[MobileCapture] Camera access error:', error)
        
        if (error instanceof DOMException) {
          if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') {
            setCameraError('Camera permission denied. Please allow camera access in your browser settings and reload.')
          } else if (error.name === 'NotFoundError' || error.name === 'DevicesNotFoundError') {
            setCameraError('No camera found. Please connect a camera device.')
          } else if (error.name === 'OverconstrainedError' || error.name === 'ConstraintNotSatisfiedError') {
            setCameraError('Camera constraints not supported. Trying with basic settings...')
            // Retry with minimal constraints
            try {
              const basicStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false })
              if (!cancelled && videoRef.current) {
                streamRef.current = basicStream
                videoRef.current.srcObject = basicStream
                videoRef.current.play().catch(e => console.warn('Basic play failed:', e))
              }
            } catch (retryError) {
              setCameraError('Unable to access camera. Please check your device settings.')
            }
          } else {
            // Check for specific "device in use" errors
            const errorMessage = error.message.toLowerCase()
            if (errorMessage.includes('device') && errorMessage.includes('use')) {
              setCameraError('Camera is in use by another application. Please close other apps using the camera and click "Retry Camera" below.')
            } else if (errorMessage.includes('permission') || errorMessage.includes('notallowed')) {
              setCameraError('Camera permission denied. Please allow camera access and reload the page.')
            } else if (errorMessage.includes('notfound') || errorMessage.includes('no device')) {
              setCameraError('No camera found. Please connect a camera and reload.')
            } else {
              setCameraError(`Camera error: ${error.message}. Please try refreshing the page.`)
            }
          }
        } else {
          setCameraError('Unable to access camera. Please allow camera permissions and reload.')
        }
      }
    }

    startCamera()

    return () => {
      cancelled = true
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop())
      }
    }
  }, [])

  useEffect(() => {
    // Fetch progress immediately
    fetchProgress()
    
    // Also set up a polling mechanism in case the first request fails
    let retryCount = 0
    const maxRetries = 5
    const intervalId = setInterval(() => {
      retryCount++
      if (retryCount <= maxRetries) {
        fetchProgress()
      } else {
        console.warn('[MobileCapture] Max retries reached, stopping polling')
        clearInterval(intervalId)
      }
    }, 3000) // Retry every 3 seconds
    
    return () => clearInterval(intervalId)
  }, [fetchProgress]) // Removed progress dependency

  useEffect(() => {
    if (!toast) return
    const timeout = setTimeout(() => setToast(null), 2500)
    return () => clearTimeout(timeout)
  }, [toast])

  const handleCapture = async () => {
    if (!videoRef.current || !canvasRef.current) return
    if (isUploading) return

    const activeWallId = currentWall?.id
    if (!activeWallId) {
      setAlertMessage('No target wall assigned yet. Please wait for guidance to load.')
      return
    }

    setIsUploading(true)
    setAlertMessage(null)

    try {
      const blob = await snapshotToBlob(videoRef.current, canvasRef.current)
      if (!blob) {
        throw new Error('Unable to capture photo. Please try again.')
      }

      const formData = new FormData()
      const filename = `capture-${Date.now()}.jpg`
      formData.append('file', blob, filename)
      formData.append('venue_id', targetVenue)
      formData.append('wall_id', activeWallId)

      // Re-detect API URL at runtime
      const currentApiUrl = getApiBaseUrl()
      const uploadUrl = `${currentApiUrl}/api/v1/capture/upload`

      const response = await fetch(uploadUrl, {
        method: 'POST',
        body: formData
        // Don't set Content-Type header - browser will set it with boundary for FormData
      })

      let payload: any = {}
      try {
        const responseText = await response.text()
        if (responseText) {
          payload = JSON.parse(responseText)
        }
      } catch (parseError) {
        console.error('[MobileCapture] Failed to parse response:', parseError)
        payload = { error: 'Invalid server response' }
      }

      if (!response.ok) {
        const errorMsg = (payload && typeof payload === 'object' && 'error' in payload) 
          ? payload.error 
          : `Server error: ${response.status}`
        console.error('[MobileCapture] Upload failed:', errorMsg)
        setAlertMessage(errorMsg)
        return
      }

      const capturedSegments = Number(payload?.captured_segments ?? 0)
      const requiredSegments = Number(payload?.required_segments ?? 1)
      const wallComplete = Boolean(payload?.wall_capture_complete)
      if (!wallComplete && requiredSegments > 1) {
        setToast({
          message: `Captured ${capturedSegments}/${requiredSegments} for this wall. Take another photo of the same wall.`,
          type: 'success',
        })
      } else {
        setToast({ message: 'Great capture! Move to the next wall.', type: 'success' })
      }
      setShowCheck(true)
      setTimeout(() => setShowCheck(false), 1200)

      // Clear retaking flag since new capture was made
      setRetakingWallId(null)

      // Refresh progress to update completed walls list
      await fetchProgress()
      // DO NOT refetch wall images - the image will be loaded naturally when progress updates
    } catch (error) {
      console.error('[MobileCapture] Capture error:', error)
      if (error instanceof TypeError && error.message.includes('fetch')) {
        setAlertMessage(`Network error: Unable to reach server at ${API_BASE_URL}. Please check your connection.`)
      } else {
        setAlertMessage(`Unexpected error: ${error instanceof Error ? error.message : 'Unknown error'}. Please retry.`)
      }
    } finally {
      setIsUploading(false)
    }
  }

  // Loading state: If progress is null, show loading spinner with timeout
  // After 10 seconds, show error and allow proceeding anyway
  useEffect(() => {
    // Clear any existing timeout
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current)
      timeoutRef.current = null
    }
    
    if (!progress) {
      timeoutRef.current = setTimeout(() => {
        setLoadingTimeout(true)
        console.warn('[MobileCapture] Progress fetch timed out, proceeding with default values')
        // Set default progress to allow camera to work
        const defaultProgress: ProgressState = {
          total_walls: 4,
          completed_walls: [],
          current_target: { id: 'wall_north', name: 'North Wall' },
          is_complete: false,
          walls: [
            { id: 'wall_north', name: 'North Wall', coordinates: [10, 10, 90, 10] },
            { id: 'wall_east', name: 'East Wall', coordinates: [90, 10, 90, 90] },
            { id: 'wall_south', name: 'South Wall', coordinates: [90, 90, 10, 90] },
            { id: 'wall_west', name: 'West Wall', coordinates: [10, 90, 10, 10] },
          ],
          floor_plan_url: null,
          wall_regions: []
        }
        setProgress(defaultProgress)
        setCurrentWall(defaultProgress.walls[0])
      }, 10000) // 10 second timeout
    } else {
      // Progress loaded, clear timeout
      setLoadingTimeout(false)
    }
    
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
        timeoutRef.current = null
      }
    }
  }, [progress])

  // Floor plan is optional - proceed with camera even without floor plan
  // Ensure we have a current wall if walls are available
  // Use a ref to track if we've already set the wall to prevent loops
  // IMPORTANT: This must be before any conditional returns
  useEffect(() => {
    if (!currentWall && !progress?.is_complete && progress?.walls && progress.walls.length > 0) {
      // Use the first incomplete wall or first wall if all are incomplete
      const firstIncomplete = progress.walls.find(w => !progress.completed_walls.includes(w.id))
      const wallToUse = firstIncomplete || progress.walls[0]
      if (wallToUse && wallSetRef.current !== wallToUse.id) {
        wallSetRef.current = wallToUse.id
        setCurrentWall(wallToUse)
      }
    }
  }, [progress, currentWall]) // Keep currentWall to reset ref when it changes

  // NOW we can do conditional returns - all hooks are above
  if (!progress) {
    return (
      <div style={{ 
        height: '100vh', 
        background: 'black', 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'center',
        flexDirection: 'column',
        gap: '20px'
      }}>
        <div className="loader" style={{ width: '48px', height: '48px', borderWidth: '4px' }} />
        <p style={{ color: 'white', fontSize: '1.1rem' }}>Loading Tour...</p>
        {loadingTimeout && (
          <p style={{ color: '#ff6b6b', fontSize: '0.9rem', marginTop: '10px' }}>
            Taking longer than expected. Check console for errors.
          </p>
        )}
      </div>
    )
  }

  const totalWalls = progress?.total_walls ?? progress?.walls?.length ?? 0
  // When retaking a wall, don't count it as completed until a new capture is made
  const completedCount = retakingWallId 
    ? (progress?.completed_walls.length ?? 0) - (progress?.completed_walls.includes(retakingWallId) ? 1 : 0)
    : progress?.completed_walls.length ?? 0
  const stepNumber = progress?.is_complete
    ? totalWalls || completedCount
    : totalWalls
    ? Math.min(completedCount + 1, totalWalls)
    : completedCount + 1
  const bannerTargetName = currentWall?.name ?? 'the next wall'
  const currentReq = currentWall?.id ? progress?.capture_requirements?.[currentWall.id] : undefined
  const currentRequiredSegments = currentReq?.required_segments ?? 1
  const currentCapturedSegments = currentReq?.captured_segments ?? 0

  const captureUrl = `${API_BASE_URL}/mobile/${venueId ?? ''}`
  const shareUrl = (import.meta.env as any).VITE_NGROK_URL || captureUrl

  return (
    <div className="capture-container" style={{ width: '100vw', height: '100vh', position: 'fixed', top: 0, left: 0 }}>
      <div
        className="share-banner"
        style={{
          position: 'absolute',
          top: '10px',
          left: '50%',
          transform: 'translateX(-50%)',
          zIndex: 1200,
          background: 'rgba(0,0,0,0.7)',
          color: '#fff',
          padding: '8px 12px',
          borderRadius: '12px',
          display: 'flex',
          gap: '10px',
          alignItems: 'center',
          fontSize: '0.85rem',
          boxShadow: '0 6px 20px rgba(0,0,0,0.3)'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <img
            src={`https://api.qrserver.com/v1/create-qr-code/?size=120x120&data=${encodeURIComponent(shareUrl)}`}
            alt="Open on phone QR"
            style={{ width: 48, height: 48, borderRadius: 6, background: '#fff' }}
          />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={{ fontWeight: 600 }}>Open guided capture on your phone</span>
            <code style={{ background: 'rgba(255,255,255,0.08)', padding: '3px 5px', borderRadius: '6px' }}>
              {shareUrl}
            </code>
          </div>
        </div>
        <button
          onClick={() => navigator.clipboard?.writeText(shareUrl).catch(() => {})}
          style={{
            background: '#4CAF50',
            color: '#fff',
            border: 'none',
            padding: '6px 10px',
            borderRadius: '6px',
            cursor: 'pointer',
            fontWeight: 600,
            whiteSpace: 'nowrap'
          }}
        >
          Copy link
        </button>
      </div>

      <div className="video-wrapper" style={{ position: 'relative', width: '100%', height: '100%' }}>
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className="capture-video"
          style={{ 
            width: '100%', 
            height: '100%', 
            objectFit: 'cover',
            backgroundColor: '#000',
            display: 'block',
            position: 'absolute',
            top: 0,
            left: 0,
            zIndex: 1
          }}
        />
        
        {/* Show message if video isn't ready or if there's an error */}
        {cameraError && (
          <div style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            background: 'rgba(200,0,0,0.9)',
            color: 'white',
            padding: '20px',
            borderRadius: '10px',
            zIndex: 10,
            textAlign: 'center',
            maxWidth: '80%'
          }}>
            <p style={{ margin: 0, fontWeight: 'bold' }}>Camera Error</p>
            <p style={{ margin: '10px 0 0 0', fontSize: '0.9rem' }}>{cameraError}</p>
            <div style={{ display: 'flex', gap: '10px', marginTop: '15px', justifyContent: 'center' }}>
              <button
                onClick={async () => {
                  // Properly release camera before retrying
                  if (streamRef.current) {
                    streamRef.current.getTracks().forEach((track) => track.stop())
                    streamRef.current = null
                  }
                  if (videoRef.current) {
                    videoRef.current.srcObject = null
                  }
                  setCameraError(null)
                  setVideoReady(false)
                  
                  // Wait a bit for camera to be released
                  await new Promise(resolve => setTimeout(resolve, 300))
                  
                  // Retry camera access
                  try {
                    const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent)
                    const constraints: MediaStreamConstraints = isMobile
                      ? { video: { facingMode: 'environment' }, audio: false }
                      : { video: { facingMode: 'environment' }, audio: false }
                    
                    const stream = await navigator.mediaDevices.getUserMedia(constraints)
                    streamRef.current = stream
                    if (videoRef.current) {
                      videoRef.current.srcObject = stream
                      await videoRef.current.play()
                      setVideoReady(true)
                      setCameraError(null)
                    }
                  } catch (error) {
                    console.error('[MobileCapture] Retry failed:', error)
                    if (error instanceof DOMException) {
                      const errorMessage = error.message.toLowerCase()
                      if (errorMessage.includes('device') && errorMessage.includes('use')) {
                        setCameraError('Camera is still in use. Please close other apps using the camera and try again.')
                      } else {
                        setCameraError(`Camera error: ${error.message}. Please refresh the page.`)
                      }
                    } else {
                      setCameraError('Unable to access camera. Please refresh the page.')
                    }
                  }
                }}
                style={{
                  padding: '10px 20px',
                  background: '#4CAF50',
                  color: 'white',
                  border: 'none',
                  borderRadius: '5px',
                  cursor: 'pointer',
                  fontWeight: 'bold'
                }}
              >
                Retry Camera
              </button>
              <button
                onClick={() => window.location.reload()}
                style={{
                  padding: '10px 20px',
                  background: 'white',
                  color: '#c00',
                  border: 'none',
                  borderRadius: '5px',
                  cursor: 'pointer',
                  fontWeight: 'bold'
                }}
              >
                Reload Page
              </button>
            </div>
          </div>
        )}
        
        {!videoReady && !cameraError && streamRef.current && (
          <div style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            background: 'rgba(0,0,0,0.8)',
            color: 'white',
            padding: '20px',
            borderRadius: '10px',
            zIndex: 10,
            textAlign: 'center'
          }}>
            <div className="loader" style={{ width: '32px', height: '32px', borderWidth: '3px', margin: '0 auto 10px' }} />
            <p>Starting camera...</p>
          </div>
        )}
        
        {/* Debug overlay showing video state */}
        {import.meta.env.DEV && (
          <div style={{
            position: 'absolute',
            bottom: '150px',
            left: '10px',
            background: 'rgba(0,0,0,0.8)',
            color: 'white',
            padding: '10px',
            fontSize: '11px',
            zIndex: 1000,
            pointerEvents: 'none',
            fontFamily: 'monospace'
          }}>
            <div>Video Ready: {videoReady ? '✓' : '✗'}</div>
            <div>Has Stream: {streamRef.current ? '✓' : '✗'}</div>
            <div>Video Element: {videoRef.current ? '✓' : '✗'}</div>
            <div>Stream Active: {streamRef.current?.active ? '✓' : '✗'}</div>
            {videoRef.current && (
              <>
                <div>Video Width: {videoRef.current.videoWidth || 'N/A'}</div>
                <div>Video Height: {videoRef.current.videoHeight || 'N/A'}</div>
                <div>Paused: {videoRef.current.paused ? 'Yes' : 'No'}</div>
              </>
            )}
          </div>
        )}

        {/* Scanner Overlay with corner brackets and scanning animation */}
        <ScannerOverlay />

        {/* Floor Plan Viewer Overlay - Removed for now, using minimap instead */}

        {progress?.walls?.length ? (
          <div className="minimap-overlay">
            <MiniMap walls={progress.walls} currentWallId={currentWall?.id ?? null} />
          </div>
        ) : null}

        <div className="overlay">
          <div className="overlay-header" style={{ position: 'relative' }}>
            <button
              onClick={() => navigate(`/venue/${venueId}`)}
              style={{
                position: 'absolute',
                top: '0',
                left: '0',
                background: 'rgba(255, 255, 255, 0.15)',
                border: '1px solid rgba(255, 255, 255, 0.3)',
                color: '#fff',
                padding: '0.5rem 1rem',
                borderRadius: '8px',
                cursor: 'pointer',
                fontSize: '0.9rem',
                zIndex: 1000,
                pointerEvents: 'auto',
                fontWeight: '600'
              }}
            >
              ← Back
            </button>
            <p className="mode-label">Smart Guided Capture</p>
            <div className="capture-banner">
              {progress?.is_complete ? (
                <div style={{ textAlign: 'center' }}>
                  <p className="capture-banner-text">✓ All walls captured! Perfect job!</p>
                  <button
                    onClick={() => navigate(`/editor/${targetVenue}`)}
                    style={{
                      marginTop: '10px',
                      marginRight: '8px',
                      padding: '0.75rem 1.2rem',
                      background: '#FF9800',
                      color: 'white',
                      border: 'none',
                      borderRadius: '8px',
                      cursor: 'pointer',
                      fontWeight: 'bold',
                      fontSize: '0.9rem',
                    }}
                  >
                    Edit All Walls
                  </button>
                  <button
                    onClick={() => {
                      navigate(`/view/${targetVenue}`)
                    }}
                    style={{
                      marginTop: '10px',
                      padding: '0.75rem 1.5rem',
                      background: '#4CAF50',
                      color: 'white',
                      border: 'none',
                      borderRadius: '8px',
                      cursor: 'pointer',
                      fontWeight: 'bold',
                      fontSize: '0.9rem',
                      boxShadow: '0 4px 12px rgba(76, 175, 80, 0.3)'
                    }}
                  >
                    View 3D Space →
                  </button>
                </div>
              ) : (
                <>
                  <p className="capture-banner-text">
                    Step {stepNumber}/{totalWalls || '—'}:{' '}
                    <strong>Photograph {bannerTargetName}</strong>
                  </p>
                  {currentRequiredSegments > 1 && (
                    <div style={{ fontSize: '0.85rem', marginTop: '6px', opacity: 0.9 }}>
                      {`Photo ${Math.min(currentCapturedSegments + 1, currentRequiredSegments)}/${currentRequiredSegments} for this wall`}
                    </div>
                  )}
                  <div style={{ fontSize: '0.85rem', marginTop: '6px', opacity: 0.8 }}>
                    {completedCount ? `${completedCount} captured, ${(progress?.total_walls || 0) - completedCount} remaining` : 'No walls captured yet'}
                  </div>
                  <div style={{ marginTop: '8px' }}>
                    <button
                      onClick={() => navigate(`/editor/${targetVenue}`)}
                      style={{
                        padding: '0.55rem 0.9rem',
                        background: 'rgba(255, 152, 0, 0.9)',
                        color: 'white',
                        border: 'none',
                        borderRadius: '8px',
                        cursor: 'pointer',
                        fontWeight: 700,
                        fontSize: '0.82rem'
                      }}
                    >
                      Edit Captured Walls
                    </button>
                  </div>
                </>
              )}
              <p className="wall-label">
                Venue <strong>{targetVenue}</strong>
              </p>
            </div>
          </div>
        </div>

        {/* Debug info - remove in production */}
        {import.meta.env.DEV && (
          <div style={{
            position: 'absolute',
            bottom: '100px',
            left: '10px',
            background: 'rgba(0,0,0,0.7)',
            color: 'white',
            padding: '8px',
            fontSize: '10px',
            zIndex: 1000,
            pointerEvents: 'none'
          }}>
            Debug: Progress={progress ? '✓' : '✗'}, Wall={currentWall ? '✓' : '✗'}, Video={videoRef.current ? '✓' : '✗'}
          </div>
        )}

        {showCheck && (
          <div className="success-check">
            <span>✔</span>
          </div>
        )}

        {/* Dynamic toast message when looking for a wall */}
        {!progress?.is_complete && currentWall && !toast && (
          <div className="feedback-toast">
            Looking for {currentWall.name}...
          </div>
        )}

        {toast && (
          <div className={`feedback-toast ${toast.type}`}>
            {toast.message}
          </div>
        )}

        {cameraError && (
          <div className="feedback-toast error">
            {cameraError}
          </div>
        )}

        {alertMessage && (
          <div className="alert-modal" role="alertdialog" aria-live="assertive">
            <div className="alert-card">
              <h3>Adjust Shot</h3>
              <p>{alertMessage}</p>
              <button onClick={() => setAlertMessage(null)}>Try Again</button>
            </div>
          </div>
        )}

        {/* Review captures panel */}
        <div className="review-panel">
          <div className="review-panel-header">
            <div className="review-panel-title">Captured Walls</div>
            <div className="review-panel-progress">
              {progress?.completed_walls.length ?? 0}/{progress?.total_walls ?? progress?.walls?.length ?? 0}
            </div>
          </div>
          <div className="review-panel-grid">
            {progress?.walls?.map((wall) => {
              const url = wallImages[wall.id]
              const isCompleted = progress?.completed_walls.includes(wall.id) && retakingWallId !== wall.id
              return (
                <div key={wall.id} className={`review-wall-card ${isCompleted ? 'captured' : ''}`} style={{ position: 'relative' }}>
                  {isCompleted && (
                    <div className="review-wall-status">✓</div>
                  )}
                  <div className="review-wall-name">{wall.name}</div>
                  {url && retakingWallId !== wall.id ? (
                    <img
                      src={url.startsWith('http') ? url : `${API_BASE_URL}${url}`}
                      alt={wall.name}
                      className="review-wall-image"
                    />
                  ) : (
                    <div className="review-wall-empty">{retakingWallId === wall.id ? 'Retaking...' : 'No image'}</div>
                  )}
                  <div className="review-wall-actions">
                    <button
                      className="review-wall-btn retake"
                      onClick={async () => {
                        const target = progress?.walls?.find(w => w.id === wall.id) as WallSegment | undefined
                        if (target) {
                          // Reset the processed image on the backend
                          const currentApiUrl = getApiBaseUrl()
                          try {
                            await fetch(`${currentApiUrl}/api/v1/venue/${venueId}/wall/${target.id}/reset`, {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' }
                            })
                          } catch (err) {
                            console.warn('[MobileCapture] Could not reset wall image:', err)
                          }
                          
                          setRetakingWallId(target.id) // Mark this wall as being retaken
                          setCurrentWall(target)
                          setToast({ message: `Now capturing ${target.name}`, type: 'success' })
                        }
                      }}
                      disabled={isUploading}
                    >
                      Retake
                    </button>
                    <button
                      className="review-wall-btn adjust"
                      onClick={() => navigate(`/edit/${venueId}/${wall.id}?from=capture`)}
                    >
                      Adjust
                    </button>
                  </div>
                </div>
              )
            }) || null}
            {(!progress?.walls || progress.walls.length === 0) && (
              <div style={{ fontSize: '0.9rem', opacity: 0.8, gridColumn: '1 / -1' }}>No walls loaded yet.</div>
            )}
          </div>
        </div>
      </div>

      {/* Floating Shutter Button */}
      <div className="shutter-button-container">
        <button
          className="shutter-button"
          onClick={handleCapture}
          disabled={isUploading || !!cameraError || !currentWall}
        >
          {isUploading ? <span className="loader" /> : ''}
        </button>
      </div>

      <canvas ref={canvasRef} className="hidden-canvas" />
    </div>
  )
}

const snapshotToBlob = async (
  video: HTMLVideoElement,
  canvas: HTMLCanvasElement
): Promise<Blob | null> => {
  const width = video.videoWidth || 1080
  const height = video.videoHeight || 1920
  canvas.width = width
  canvas.height = height

  const ctx = canvas.getContext('2d')
  if (!ctx) return null

  ctx.drawImage(video, 0, 0, width, height)

  return await new Promise((resolve) =>
    canvas.toBlob((blob) => resolve(blob), 'image/jpeg', 0.92)
  )
}

export default MobileCapture




