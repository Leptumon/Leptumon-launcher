/** On/off switch for settings that apply immediately. */
import React from 'react';

type SwitchProps = {
  checked: boolean;
  onChange: (checked: boolean) => void;
  /** Id of the element naming this switch (the setting row's title). */
  labelledBy?: string;
  disabled?: boolean;
};

const Switch: React.FC<SwitchProps> = ({ checked, onChange, labelledBy, disabled = false }) => (
  <button
    type="button"
    role="switch"
    aria-checked={checked}
    aria-labelledby={labelledBy}
    disabled={disabled}
    className={`ui-switch${checked ? ' is-on' : ''}`}
    onClick={() => onChange(!checked)}
  >
    <span className="ui-switch__thumb" />
  </button>
);

export default Switch;
