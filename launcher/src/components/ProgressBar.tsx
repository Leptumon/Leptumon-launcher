/** Thin install progress bar shown under the Play button while launching. */
import React from 'react';

interface ProgressBarProps {
  /** The progress percentage, from 0 to 100. */
  percent: number;
  /** An optional label to display in the center of the bar. */
  label?: string;
}

const ProgressBar: React.FC<ProgressBarProps> = ({ percent, label }) => {
  const clampedPercent = Math.min(100, Math.max(0, percent));

  return (
    <div className="progressBarContainer" title={`${clampedPercent}%`}>
      <div
        className="progressBarFill"
        style={{ width: `${clampedPercent}%` }}
        role="progressbar"
        aria-valuenow={clampedPercent}
        aria-valuemin={0}
        aria-valuemax={100}
      />
      {label && <span className="progressBarLabel">{label}</span>}
    </div>
  );
};

export default ProgressBar;
