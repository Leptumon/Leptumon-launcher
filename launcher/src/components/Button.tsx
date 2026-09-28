/**
 * Shared button. Variants: primary (accent fill), secondary (neutral control),
 * danger (tinted red, for log out and destructive confirms), ghost (text only).
 */
import React from 'react';

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  icon?: React.ReactNode;
};

const Button: React.FC<ButtonProps> = ({
  variant = 'secondary',
  size = 'md',
  icon,
  className,
  children,
  type = 'button',
  ...rest
}) => (
  <button
    type={type}
    className={['ui-button', `ui-button--${variant}`, `ui-button--${size}`, className].filter(Boolean).join(' ')}
    {...rest}
  >
    {icon && <span className="ui-button__icon" aria-hidden="true">{icon}</span>}
    {children}
  </button>
);

export default Button;
