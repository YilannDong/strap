import './Card.css';

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  elevated?: boolean;
  padding?: 'md' | 'lg';
}

/** DS Card — instance of Figma "Card (12:512)". */
export function Card({ elevated = false, padding = 'md', children, ...rest }: CardProps) {
  return (
    <div className={`ds-card ds-card--${padding} ${elevated ? 'ds-card--elevated' : ''}`} {...rest}>
      {children}
    </div>
  );
}
