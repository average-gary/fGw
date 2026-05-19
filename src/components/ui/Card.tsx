import {
  forwardRef,
  type HTMLAttributes,
  type ReactNode,
} from 'react';
import { cn } from '@/lib/cn';

export type CardVariant = 'default' | 'flat' | 'inset';

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  variant?: CardVariant;
  /** Subtle hover lift; pair with onClick or wrap in a button/link. */
  hoverable?: boolean;
  header?: ReactNode;
  footer?: ReactNode;
  /** Slot rendered above the header (e.g. eyebrow tag, photo). */
  media?: ReactNode;
  /** Removes default body padding when you need edge-to-edge content. */
  bodyless?: boolean;
}

const VARIANT: Record<CardVariant, string> = {
  default: 'bg-bloom-50 border border-soil-200 shadow-paper',
  flat: 'bg-bloom-50 border border-soil-200',
  inset: 'bg-soil-100/60 border border-soil-200/60',
};

export const Card = forwardRef<HTMLDivElement, CardProps>(function Card(
  {
    variant = 'default',
    hoverable = false,
    header,
    footer,
    media,
    bodyless = false,
    className,
    children,
    ...rest
  },
  ref,
) {
  return (
    <div
      ref={ref}
      className={cn(
        'rounded-card overflow-hidden text-soil-800',
        'transition-[transform,box-shadow,border-color] duration-150',
        VARIANT[variant],
        hoverable &&
          'hover:-translate-y-0.5 hover:shadow-paper hover:border-soil-300 cursor-pointer',
        className,
      )}
      {...rest}
    >
      {media && <div className="bg-soil-100">{media}</div>}
      {header && (
        <div
          className={cn(
            'px-4 pt-4 pb-2',
            'border-b border-soil-100',
          )}
        >
          {header}
        </div>
      )}
      {!bodyless && children != null && (
        <div className="px-4 py-4">{children}</div>
      )}
      {bodyless && children != null && children}
      {footer && (
        <div className="px-4 py-3 border-t border-soil-100 bg-soil-50/60">
          {footer}
        </div>
      )}
    </div>
  );
});

/** Convenience: a serif card title with consistent type ramp. */
export function CardTitle({
  className,
  children,
  ...rest
}: HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h3
      className={cn(
        'font-serif text-xl text-soil-900 leading-tight',
        className,
      )}
      {...rest}
    >
      {children}
    </h3>
  );
}

/** Convenience: small caption below a CardTitle. */
export function CardSubtitle({
  className,
  children,
  ...rest
}: HTMLAttributes<HTMLParagraphElement>) {
  return (
    <p className={cn('text-sm text-soil-500 mt-0.5', className)} {...rest}>
      {children}
    </p>
  );
}

export default Card;
