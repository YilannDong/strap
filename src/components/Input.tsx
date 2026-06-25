import './Input.css';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  size?: 'sm' | 'md' | 'lg';
}

/** DS Input — instance of Figma "Input / Text (12:401)". */
export function Input({ label, error, size = 'md', id, ...rest }: InputProps) {
  const inputId = id || `ds-input-${Math.random().toString(36).slice(2, 8)}`;
  return (
    <label className="ds-field" htmlFor={inputId}>
      {label ? <span className="ds-field__label">{label}</span> : null}
      <input id={inputId} className={`ds-input ds-input--${size} ${error ? 'ds-input--error' : ''}`} {...rest} />
      {error ? <span className="ds-field__error">{error}</span> : null}
    </label>
  );
}
