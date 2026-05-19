import {
  forwardRef,
  useId,
  type ReactNode,
  type SelectHTMLAttributes,
} from 'react';
import { cn } from '@/lib/cn';

export type SelectVariant = 'default' | 'filled';

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export interface SelectProps
  extends Omit<SelectHTMLAttributes<HTMLSelectElement>, 'size'> {
  label?: ReactNode;
  helperText?: ReactNode;
  error?: ReactNode;
  variant?: SelectVariant;
  /** Pass options as array, or use `children` for grouped/custom <option>s. */
  options?: SelectOption[];
  /** Optional placeholder rendered as a disabled empty option. */
  placeholder?: string;
  className?: string;
  selectClassName?: string;
}

const VARIANT: Record<SelectVariant, { wrap: string; focus: string }> = {
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

/** Caret icon — kept inline so the chevron tracks `currentColor`. */
const Caret = () => (
  <svg
    width="14"
    height="14"
    viewBox="0 0 14 14"
    aria-hidden="true"
    className="shrink-0"
  >
    <path
      d="M3 5.5l4 4 4-4"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      fill="none"
    />
  </svg>
);

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  {
    label,
    helperText,
    error,
    variant = 'default',
    options,
    placeholder,
    id,
    className,
    selectClassName,
    disabled,
    required,
    children,
    value,
    defaultValue,
    ...rest
  },
  ref,
) {
  const reactId = useId();
  const selectId = id ?? `select-${reactId}`;
  const helperId = helperText || error ? `${selectId}-help` : undefined;
  const hasError = !!error;
  const v = VARIANT[variant];

  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      {label != null && (
        <label
          htmlFor={selectId}
          className="text-sm font-medium text-soil-800 leading-tight"
        >
          {label}
          {required && <span className="text-harvest-600 ml-0.5">*</span>}
        </label>
      )}
      <div
        className={cn(
          'relative flex items-stretch rounded-card overflow-hidden',
          'transition-[background-color,border-color,box-shadow] duration-100',
          v.wrap,
          v.focus,
          hasError &&
            '!border-harvest-500 focus-within:!ring-harvest-500/30 focus-within:!border-harvest-600',
          disabled && 'opacity-60 pointer-events-none',
        )}
      >
        <select
          id={selectId}
          ref={ref}
          disabled={disabled}
          required={required}
          aria-invalid={hasError || undefined}
          aria-describedby={helperId}
          value={value}
          defaultValue={defaultValue}
          className={cn(
            'min-w-0 flex-1 bg-transparent px-3 py-2.5 pr-9 text-base',
            'text-soil-900',
            'outline-none focus:outline-none',
            'h-touch',
            'appearance-none',
            selectClassName,
          )}
          {...rest}
        >
          {placeholder !== undefined && (
            <option value="" disabled hidden>
              {placeholder}
            </option>
          )}
          {options
            ? options.map((o) => (
                <option key={o.value} value={o.value} disabled={o.disabled}>
                  {o.label}
                </option>
              ))
            : children}
        </select>
        <span
          className={cn(
            'pointer-events-none absolute right-3 top-1/2 -translate-y-1/2',
            'text-soil-500',
          )}
        >
          <Caret />
        </span>
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

export default Select;
