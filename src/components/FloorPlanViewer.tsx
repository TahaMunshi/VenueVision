import { useEffect, useRef } from 'react'
import './FloorPlanViewer.css'

type WallRegion = {
  id: string
  name: string
  x: number
  y: number
  width: number
  height: number
}

type FloorPlanViewerProps = {
  floorPlanUrl: string
  walls: WallRegion[]
  currentWallId: string | null
}

const FloorPlanViewer = ({ floorPlanUrl, walls, currentWallId }: FloorPlanViewerProps) => {
  const containerRef = useRef<HTMLDivElement>(null)
  const imageRef = useRef<HTMLImageElement>(null)

  useEffect(() => {
    // Ensure image loads properly
    if (imageRef.current) {
      imageRef.current.onload = () => {
        // Image loaded
      }
    }
  }, [floorPlanUrl])

  const currentWall = walls.find(w => w.id === currentWallId)

  return (
    <div className="floor-plan-viewer" ref={containerRef}>
      <div className="floor-plan-container">
        <img
          ref={imageRef}
          src={floorPlanUrl}
          alt="Floor plan"
          className="floor-plan-image"
        />
        
        {/* Overlay for wall highlighting */}
        <svg className="wall-overlay" viewBox="0 0 100 100" preserveAspectRatio="none">
          {walls.map((wall) => {
            const isActive = wall.id === currentWallId
            return (
              <rect
                key={wall.id}
                x={wall.x}
                y={wall.y}
                width={wall.width}
                height={wall.height}
                className={`wall-region ${isActive ? 'active' : ''}`}
                fill={isActive ? 'rgba(0, 200, 81, 0.3)' : 'transparent'}
                stroke={isActive ? '#00C851' : 'transparent'}
                strokeWidth="2"
              />
            )
          })}
        </svg>

        {/* Current wall label */}
        {currentWall && (
          <div
            className="wall-label"
            style={{
              left: `${currentWall.x + currentWall.width / 2}%`,
              top: `${currentWall.y - 5}%`,
            }}
          >
            <div className="wall-label-content">
              <span className="wall-label-icon">📍</span>
              <span className="wall-label-text">{currentWall.name}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default FloorPlanViewer

