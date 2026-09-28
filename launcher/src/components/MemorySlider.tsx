/**
 * RAM picker: a slider over the range this machine can give the game, plus
 * one-click presets. The preset matching the launcher's suggestion for this
 * machine is marked as recommended.
 */
import React from 'react';

import type { RamInfo } from '../types/api/ramInfo';

/** Slider resolution. Saved values are aligned further in main (normalizeRamMb). */
export const MEMORY_STEP_MB = 512;

const PRESETS_MB = [6144, 8192, 10240, 12288, 16384];

type MemorySliderProps = {
  value: number;
  info: RamInfo;
  onChange: (mb: number) => void;
  format: (mb: number) => string;
  recommendedLabel: string;
  labelledBy?: string;
};

const MemorySlider: React.FC<MemorySliderProps> = ({ value, info, onChange, format, recommendedLabel, labelledBy }) => {
  const min = info.min;
  const max = Math.max(min, Math.floor(info.max / MEMORY_STEP_MB) * MEMORY_STEP_MB);
  const clamped = Math.min(max, Math.max(min, value));
  const fill = max > min ? ((clamped - min) / (max - min)) * 100 : 100;

  const presets = Array.from(new Set([...PRESETS_MB, info.recommended]))
    .filter((mb) => mb >= min && mb <= max)
    .sort((a, b) => a - b);

  return (
    <div className="memory-slider">
      <input
        type="range"
        className="memory-slider__range"
        min={min}
        max={max}
        step={MEMORY_STEP_MB}
        value={clamped}
        disabled={max <= min}
        aria-labelledby={labelledBy}
        aria-valuetext={format(clamped)}
        style={{ '--fill': `${fill}%` } as React.CSSProperties}
        onChange={(event) => onChange(Number(event.target.value))}
      />
      {presets.length > 1 && (
        <div className="memory-slider__presets">
          {presets.map((mb) => (
            <button
              key={mb}
              type="button"
              className={`memory-preset${mb === clamped ? ' is-selected' : ''}`}
              aria-pressed={mb === clamped}
              onClick={() => onChange(mb)}
            >
              {format(mb)}
              {mb === info.recommended && <span className="memory-preset__badge">{recommendedLabel}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export default MemorySlider;
