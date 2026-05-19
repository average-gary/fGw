import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { Spinner } from './Spinner';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'destructive';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps
  extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  /** Slot to the left of the label (e.g. icon). */
  leadingIcon?: ReactNode;
  /** Slot to the right of the label. */
  trailingIcon?: ReactNode;
  /** Stretch to fill container width. */
  fullWidth?: boolean;
  children?: ReactNode;
}

const VARIANT: Record<ButtonVariant, string> = {
  primary: cn(
    'bg-moss-600 text-bloom-50 border-moss-700/40',
    'hover:bg-moss-700 active:bg-moss-800',
    'shadow-press',
    'active:shadow-press-sunken active:translate-y-px',
    'disabled:bg-moss-300 disabled:text-bloom-50/80 disabled:shadow-none',
  ),
  secondary: cn(
    'bg-bloom-50 text-soil-800 border-soil-200',
    'hover:bg-bloom-100 active:bg-bloom-200',
    'shadow-press',
    'active:shadow-press-sunken active:translate-y-px',
    'disabled:bg-soil-100 disabled:text-soil-400 disabled:shadow-none',
  ),
  ghost: cn(
    'bg-transparent text-soil-700 border-transparent',
    'hover:bg-soil-100/70 active:bg-soil-200/70',
    'disabled:text-soil-400',
  ),
  destructive: cn(
    'bg-harvest-600 text-bloom-50 border-harvest-700/40',
    'hover:bg-harvest-700 active:bg-harvest-800',
    'shadow-press',
    'active:shadow-press-sunken active:translate-y-px',
    'disabled:bg-harvest-300 disabled:text-bloom-50/80 disabled:shadow-none',
  ),
};

const SIZE: Record<ButtonSize, string> = {
  sm: 'h-9 px-3 text-sm gap-1.5 rounded-card',
  md: 'h-11 px-4 text-base gap-2 rounded-card', // 44px touch target
  lg: 'h-13 px-6 text-lg gap-2.5 rounded-card',
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  function Button(
    {
      variant = 'primary',
      size = 'md',
      loading = false,
      leadingIcon,
      trailingIcon,
      fullWidth = false,
      disabled,
      className,
      children,
      type,
      ...rest
    },
    ref,
  ) {
    const isDisabled = disabled || loading;
    return (
      <button
        ref={ref}
        type={type ?? 'button'}
        disabled={isDisabled}
        aria-busy={loading || undefined}
        className={cn(
          'inline-flex items-center justify-center select-none',
          'border font-sans font-medium tracking-tight',
          'transition-[background-color,box-shadow,transform] duration-100',
          'focus-visible:shadow-focus focus-visible:outline-none',
          'disabled:cursor-not-allowed',
          fullWidth && 'w-full',
          VARIANT[variant],
          SIZE[size],
          className,
        )}
        {...rest}
      >
        {loading ? (
          <Spinner
            size={size === 'lg' ? 'md' : 'sm'}
            tone="current"
            label={null}
            className="-ml-0.5"
          />
        ) : leadingIcon ? (
          <span className="-ml-0.5 inline-flex shrink-0">{leadingIcon}</span>
        ) : null}
        {children != null && <span className="truncate">{children}</span>}
        {!loading && trailingIcon ? (
          <span className="-mr-0.5 inline-flex shrink-0">{trailingIcon}</span>
        ) : null}
      </button>
    );
  },
);

export default Button;
