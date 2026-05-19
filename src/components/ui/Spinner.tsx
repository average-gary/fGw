import { cn } from '@/lib/cn';

export type SpinnerSize = 'xs' | 'sm' | 'md' | 'lg';
export type SpinnerTone = 'current' | 'moss' | 'soil' | 'bloom';

export interface SpinnerProps {
  size?: SpinnerSize;
  tone?: SpinnerTone;
  className?: string;
  /** Accessible label; pass null/empty to hide. Defaults to "Loading". */
  label?: string | null;
}

const SIZE_PX: Record<SpinnerSize, number> = {
  xs: 12,
  sm: 16,
  md: 20,
  lg: 28,
};

const TONE: Record<SpinnerTone, string> = {
  current: 'text-current',
  moss: 'text-moss-600',
  soil: 'text-soil-500',
  bloom: 'text-bloom-100',
};

/**
 * Inline SVG spinner. Two-arc design (a long arc + a short tick) — feels
 * less generic than the typical 3/4 ring.
 */
export function Spinner({
  size = 'sm',
  tone = 'current',
  className,
  label = 'Loading',
}: SpinnerProps) {
  const px = SIZE_PX[size];
  return (
    <span
      role={label ? 'status' : undefined}
      aria-live={label ? 'polite' : undefined}
      className={cn('inline-flex items-center justify-center', className)}
    >
      <svg
        width={px}
        height={px}
        viewBox="0 0 24 24"
        fill="none"
        className={cn('animate-spin', TONE[tone])}
        aria-hidden="true"
      >
        <circle
          cx="12"
          cy="12"
          r="9"
          stroke="currentColor"
          strokeOpacity="0.18"
          strokeWidth="2.5"
        />
        <path
          d="M21 12a9 9 0 0 0-9-9"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
        />
        <path
          d="M3 12a9 9 0 0 0 2 5.6"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeOpacity="0.6"
        />
      </svg>
      {label ? <span className="sr-only">{label}</span> : null}
    </span>
  );
}

export default Spinner;
