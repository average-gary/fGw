import {
  forwardRef,
  useId,
  type InputHTMLAttributes,
  type ReactNode,
} from 'react';
import { cn } from '@/lib/cn';

export type InputVariant = 'default' | 'filled';

export interface InputProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, 'size'> {
  label?: ReactNode;
  helperText?: ReactNode;
  error?: ReactNode;
  variant?: InputVariant;
  /** Render an icon/element on the leading edge of the field. */
  leadingAdornment?: ReactNode;
  /** Render on the trailing edge (e.g. unit label, clear button). */
  trailingAdornment?: ReactNode;
  /** Wrapper className; use `inputClassName` for the input itself. */
  className?: string;
  inputClassName?: string;
}

const VARIANT: Record<InputVariant, { wrap: string; focus: string }> = {
  default: {
    wrap: 'bg-bloom-50 border border-soil-200',
    focus:
      'focus-within:border-moss-500 focus-within:ring-2 focus-within:ring-moss-500/25',
  },
  filled: {
    wrap: 'bg-soil-100/70 border border-transparent',
    focus:
      'focus-within:bg-bloom-50 focus-within:border-moss-500 focus-within:ring-2 focus-within:ring-moss-500/25',
  },
};

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  {
    label,
    helperText,
    error,
    variant = 'default',
    leadingAdornment,
    trailingAdornment,
    id,
    className,
    inputClassName,
    disabled,
    required,
    ...rest
  },
  ref,
) {
  const reactId = useId();
  const inputId = id ?? `input-${reactId}`;
  const helperId = helperText || error ? `${inputId}-help` : undefined;
  const hasError = !!error;
  const v = VARIANT[variant];

  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      {label != null && (
        <label
          htmlFor={inputId}
          className="text-sm font-medium text-soil-800 leading-tight"
        >
          {label}
          {required && <span className="text-harvest-600 ml-0.5">*</span>}
        </label>
      )}
      <div
        className={cn(
          'flex items-stretch overflow-hidden rounded-card',
          'transition-[background-color,border-color,box-shadow] duration-100',
          v.wrap,
          v.focus,
          hasError &&
            '!border-harvest-500 focus-within:!ring-harvest-500/30 focus-within:!border-harvest-600',
          disabled && 'opacity-60 pointer-events-none',
        )}
      >
        {leadingAdornment && (
          <span className="flex items-center pl-3 pr-1 text-soil-500">
            {leadingAdornment}
          </span>
        )}
        <input
          id={inputId}
          ref={ref}
          disabled={disabled}
          required={required}
          aria-invalid={hasError || undefined}
          aria-describedby={helperId}
          className={cn(
            'min-w-0 flex-1 bg-transparent px-3 py-2.5 text-base',
            'text-soil-900 placeholder:text-soil-400',
            'outline-none focus:outline-none',
            // Touch-friendly height baseline.
            'h-touch',
            inputClassName,
          )}
          {...rest}
        />
        {trailingAdornment && (
          <span className="flex items-center pr-3 pl-1 text-soil-500">
            {trailingAdornment}
          </span>
        )}
      </div>
      {(error || helperText) && (
        <p
          id={helperId}
          className={cn(
            'text-xs leading-snug',
            hasError ? 'text-harvest-700' : 'text-soil-500',
          )}
        >
          {error ?? helperText}
        </p>
      )}
    </div>
  );
});

export default Input;
