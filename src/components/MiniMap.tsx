import './MiniMap.css'

type WallSegment = {
  id: string
  name: string
  coordinates: [number, number, number, number]
}

type MiniMapProps = {
  walls: WallSegment[]
  currentWallId?: string | null
}

const MiniMap = ({ walls, currentWallId }: MiniMapProps) => {
  if (!walls || walls.length === 0) return null

  const activeWall = walls.find((wall) => wall.id === currentWallId)

  return (
    <div className="mini-map">
      <svg
        viewBox="0 0 100 100"
        role="img"
        aria-label={
          activeWall
            ? `Highlighting ${activeWall.name} on venue floor plan`
            : 'Venue floor plan'
        }
      >
        <rect className="mini-map-boundary" x="5" y="5" width="90" height="90" rx="8" />
        {walls.map((wall) => {
          const [x1, y1, x2, y2] = wall.coordinates
          const isActive = wall.id === currentWallId
          return (
            <line
              key={wall.id}
              x1={x1}
              y1={y1}
              x2={x2}
              y2={y2}
              className={isActive ? 'wall-segment active' : 'wall-segment'}
            />
          )
        })}
      </svg>
      <p className="mini-map-caption">
        {activeWall ? `Target: ${activeWall.name}` : 'All walls captured'}
      </p>
    </div>
  )
}

export type { WallSegment }
export default MiniMap

