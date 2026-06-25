import './Button.css';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'sm' | 'md' | 'lg';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  leadingIcon?: React.ReactNode;
}

/** DS Button — instance of Figma "Button (12:340)". All visuals come from tokens. */
export function Button({ variant = 'primary', size = 'md', leadingIcon, children, ...rest }: ButtonProps) {
  return (
    <button className={`ds-btn ds-btn--${variant} ds-btn--${size}`} {...rest}>
      {leadingIcon ? <span className="ds-btn__icon">{leadingIcon}</span> : null}
      {children}
    </button>
  );
}
