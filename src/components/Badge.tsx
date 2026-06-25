import './Badge.css';

export interface BadgeProps {
  variant?: 'neutral' | 'success' | 'danger';
  children: React.ReactNode;
}

/** DS Badge — instance of Figma "Badge (12:560)". */
export function Badge({ variant = 'neutral', children }: BadgeProps) {
  return <span className={`ds-badge ds-badge--${variant}`}>{children}</span>;
}
