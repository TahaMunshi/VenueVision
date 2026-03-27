import { Link } from 'react-router-dom'
import './GuidedFlowStepper.css'

export type GuidedFlowStep = 'capture' | 'review' | 'remove' | 'corners'

const STEPS: { id: GuidedFlowStep; label: string; short: string }[] = [
  { id: 'capture', label: 'Capture', short: '1' },
  { id: 'review', label: 'Stitch', short: '2' },
  { id: 'remove', label: 'Remove', short: '3' },
  { id: 'corners', label: 'Corners', short: '4' },
]

type Props = {
  venueId: string
  wallId?: string | null
  active: GuidedFlowStep
  className?: string
  /** Tighter padding for mobile capture / small viewports */
  compact?: boolean
}

const stepIndex = (s: GuidedFlowStep) => STEPS.findIndex((x) => x.id === s)

export default function GuidedFlowStepper({
  venueId,
  wallId,
  active,
  className = '',
  compact = false,
}: Props) {
  const current = stepIndex(active)
  const canLinkWall = Boolean(wallId)

  const hrefFor = (step: GuidedFlowStep): string | null => {
    switch (step) {
      case 'capture':
        return `/capture/${venueId}`
      case 'review':
        return canLinkWall ? `/review/${venueId}/${wallId}` : null
      case 'remove':
        return canLinkWall ? `/remove/${venueId}/${wallId}` : null
      case 'corners':
        return canLinkWall ? `/edit/${venueId}/${wallId}?step=corners` : null
      default:
        return null
    }
  }

  return (
    <nav
      className={`guided-flow-stepper ${compact ? 'guided-flow-stepper--compact' : ''} ${className}`.trim()}
      aria-label="Wall processing steps"
    >
      <ol className="guided-flow-stepper-list">
        {STEPS.map((step, i) => {
          const href = hrefFor(step.id)
          const isActive = step.id === active
          const isDone = i < current
          const content = (
            <>
              <span className="guided-flow-step-marker" data-done={isDone} data-active={isActive}>
                {isDone ? '✓' : step.short}
              </span>
              <span className="guided-flow-step-label">{step.label}</span>
            </>
          )

          if (href && !isActive) {
            return (
              <li key={step.id} className="guided-flow-step-item">
                <Link to={href} className="guided-flow-step-link">
                  {content}
                </Link>
              </li>
            )
          }

          return (
            <li
              key={step.id}
              className={`guided-flow-step-item ${isActive ? 'is-active' : ''} ${!href && i > 0 ? 'is-disabled' : ''}`}
            >
              <span className="guided-flow-step-static">{content}</span>
            </li>
          )
        })}
      </ol>
      {!canLinkWall && current > 0 && (
        <p className="guided-flow-stepper-hint">Select a wall in capture to open later steps.</p>
      )}
    </nav>
  )
}
