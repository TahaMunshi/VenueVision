import { Link } from 'react-router-dom'
import './GuidedFlowStepper.css'

export type GuidedFlowStep = 'capture' | 'review' | 'corners'

const STEPS: { id: GuidedFlowStep; label: string; short: string }[] = [
  { id: 'capture', label: 'Capture', short: '1' },
  { id: 'review', label: 'Prepare', short: '2' },
  { id: 'corners', label: 'Corners', short: '3' },
]

type Props = {
  venueId: string
  wallId?: string | null
  active: GuidedFlowStep
  className?: string
  /** Tighter padding for mobile capture / small viewports */
  compact?: boolean
  /** When true, capture links include ?wall= so you return to the same wall. */
  linkCaptureToWall?: boolean
}

const stepIndex = (s: GuidedFlowStep) => STEPS.findIndex((x) => x.id === s)

export default function GuidedFlowStepper({
  venueId,
  wallId,
  active,
  className = '',
  compact = false,
  linkCaptureToWall = false,
}: Props) {
  const current = stepIndex(active)
  const canLinkWall = Boolean(wallId)

  const hrefFor = (step: GuidedFlowStep): string | null => {
    switch (step) {
      case 'capture':
        return canLinkWall && linkCaptureToWall
          ? `/capture/${venueId}?wall=${encodeURIComponent(wallId!)}`
          : `/capture/${venueId}`
      case 'review':
        return canLinkWall ? `/review/${venueId}/${wallId}` : null
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
      <p className="guided-flow-stepper-hint guided-flow-stepper-hint--always">
        Fast workflow — capture or upload, prepare the wall image, then adjust corners to finish.
      </p>
      {!canLinkWall && current > 0 && (
        <p className="guided-flow-stepper-hint">Pick a wall on the capture screen (or wall list) to deep-link later steps.</p>
      )}
    </nav>
  )
}
