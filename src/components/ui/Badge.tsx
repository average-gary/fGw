import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from '@/lib/cn';

export type BadgeVariant =
  | 'default'
  | 'success'
  | 'warning'
  | 'danger'
  | 'muted';
export type BadgeSize = 'sm' | 'md';

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
  size?: BadgeSize;
  /** Optional dot indicator on the leading edge. */
  dot?: boolean;
  leadingIcon?: ReactNode;
}

const VARIANT: Record<BadgeVariant, { bg: string; text: string; ring: string; dot: string }> = {
  default: {
    bg: 'bg-soil-100',
    text: 'text-soil-800',
    ring: 'ring-soil-200',
    dot: 'bg-soil-500',
  },
  success: {
    bg: 'bg-moss-100',
    text: 'text-moss-800',
    ring: 'ring-moss-200',
    dot: 'bg-moss-500',
  },
  warning: {
    bg: 'bg-harvest-100',
    text: 'text-harvest-800',
    ring: 'ring-harvest-200',
    dot: 'bg-harvest-500',
  },
  danger: {
    // Deeper rust for danger; differentiates from warning by ramp + ring.
    bg: 'bg-harvest-200',
    text: 'text-harvest-900',
    ring: 'ring-harvest-400',
    dot: 'bg-harvest-700',
  },
  muted: {
    bg: 'bg-dusk-100',
    text: 'text-dusk-700',
    ring: 'ring-dusk-200',
    dot: 'bg-dusk-400',
  },
};

const SIZE: Record<BadgeSize, string> = {
  sm: 'text-[11px] leading-none px-1.5 py-1 gap-1',
  md: 'text-xs leading-none px-2 py-1.5 gap-1.5',
};

export function Badge({
  variant = 'default',
  size = 'sm',
  dot = false,
  leadingIcon,
  className,
  children,
  ...rest
}: BadgeProps) {
  const v = VARIANT[variant];
  return (
    <span
      className={cn(
        'inline-flex items-center font-mono font-medium tracking-wide uppercase',
        'rounded-pill ring-1',
        v.bg,
        v.text,
        v.ring,
        SIZE[size],
        className,
      )}
      {...rest}
    >
      {dot && (
        <span
          aria-hidden="true"
          className={cn('inline-block h-1.5 w-1.5 rounded-full', v.dot)}
        />
      )}
      {leadingIcon && <span className="inline-flex">{leadingIcon}</span>}
      {children}
    </span>
  );
}

export default Badge;
