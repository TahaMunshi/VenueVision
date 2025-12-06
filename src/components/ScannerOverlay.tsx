import React from 'react';
import './ScannerOverlay.css';

const ScannerOverlay: React.FC = () => {
  const bracketSize = 40;
  const bracketOffset = 20;
  const bracketThickness = 3;

  return (
    <div className="scanner-overlay">
      {/* Top Left Corner Bracket */}
      <svg
        className="scanner-bracket bracket-top-left"
        width={bracketSize}
        height={bracketSize}
        style={{
          position: 'absolute',
          top: bracketOffset,
          left: bracketOffset,
        }}
      >
        <path
          d={`M 0 ${bracketThickness} L 0 ${bracketSize} L ${bracketSize} ${bracketSize}`}
          stroke="#00C851"
          strokeWidth={bracketThickness}
          fill="none"
          strokeLinecap="round"
          filter="url(#glow)"
        />
        <path
          d={`M ${bracketThickness} 0 L ${bracketSize} 0 L ${bracketSize} ${bracketSize}`}
          stroke="#00C851"
          strokeWidth={bracketThickness}
          fill="none"
          strokeLinecap="round"
          filter="url(#glow)"
        />
        <defs>
          <filter id="glow">
            <feGaussianBlur stdDeviation="2" result="coloredBlur" />
            <feMerge>
              <feMergeNode in="coloredBlur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
      </svg>

      {/* Top Right Corner Bracket */}
      <svg
        className="scanner-bracket bracket-top-right"
        width={bracketSize}
        height={bracketSize}
        style={{
          position: 'absolute',
          top: bracketOffset,
          right: bracketOffset,
        }}
      >
        <path
          d={`M ${bracketSize} ${bracketThickness} L ${bracketSize} ${bracketSize} L 0 ${bracketSize}`}
          stroke="#00C851"
          strokeWidth={bracketThickness}
          fill="none"
          strokeLinecap="round"
          filter="url(#glow)"
        />
        <path
          d={`M ${bracketSize - bracketThickness} 0 L 0 0 L 0 ${bracketSize}`}
          stroke="#00C851"
          strokeWidth={bracketThickness}
          fill="none"
          strokeLinecap="round"
          filter="url(#glow)"
        />
        <defs>
          <filter id="glow">
            <feGaussianBlur stdDeviation="2" result="coloredBlur" />
            <feMerge>
              <feMergeNode in="coloredBlur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
      </svg>

      {/* Bottom Left Corner Bracket */}
      <svg
        className="scanner-bracket bracket-bottom-left"
        width={bracketSize}
        height={bracketSize}
        style={{
          position: 'absolute',
          bottom: bracketOffset,
          left: bracketOffset,
        }}
      >
        <path
          d={`M 0 ${bracketSize - bracketThickness} L 0 0 L ${bracketSize} 0`}
          stroke="#00C851"
          strokeWidth={bracketThickness}
          fill="none"
          strokeLinecap="round"
          filter="url(#glow)"
        />
        <path
          d={`M ${bracketThickness} ${bracketSize} L ${bracketSize} ${bracketSize} L ${bracketSize} 0`}
          stroke="#00C851"
          strokeWidth={bracketThickness}
          fill="none"
          strokeLinecap="round"
          filter="url(#glow)"
        />
        <defs>
          <filter id="glow">
            <feGaussianBlur stdDeviation="2" result="coloredBlur" />
            <feMerge>
              <feMergeNode in="coloredBlur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
      </svg>

      {/* Bottom Right Corner Bracket */}
      <svg
        className="scanner-bracket bracket-bottom-right"
        width={bracketSize}
        height={bracketSize}
        style={{
          position: 'absolute',
          bottom: bracketOffset,
          right: bracketOffset,
        }}
      >
        <path
          d={`M ${bracketSize} ${bracketSize - bracketThickness} L ${bracketSize} 0 L 0 0`}
          stroke="#00C851"
          strokeWidth={bracketThickness}
          fill="none"
          strokeLinecap="round"
          filter="url(#glow)"
        />
        <path
          d={`M ${bracketSize - bracketThickness} ${bracketSize} L 0 ${bracketSize} L 0 0`}
          stroke="#00C851"
          strokeWidth={bracketThickness}
          fill="none"
          strokeLinecap="round"
          filter="url(#glow)"
        />
        <defs>
          <filter id="glow">
            <feGaussianBlur stdDeviation="2" result="coloredBlur" />
            <feMerge>
              <feMergeNode in="coloredBlur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
      </svg>

      {/* Scanning Laser Animation */}
      <div className="scanner-laser" />
    </div>
  );
};

export default ScannerOverlay;
