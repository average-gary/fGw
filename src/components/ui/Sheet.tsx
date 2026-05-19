import {
  useEffect,
  useRef,
  type HTMLAttributes,
  type ReactNode,
} from 'react';
import { cn } from '@/lib/cn';

export interface SheetProps {
  open: boolean;
  onClose: () => void;
  /** Title rendered in the sheet's grab-handle area. */
  title?: ReactNode;
  /** Optional subtitle / eyebrow line. */
  description?: ReactNode;
  /** Footer pinned at bottom of sheet (e.g. action buttons). */
  footer?: ReactNode;
  /** Maximum height of the sheet as a CSS length. Defaults to 90vh. */
  maxHeight?: string;
  children?: ReactNode;
  /** Extra class on the sheet panel itself. */
  className?: string;
  /** Hide the close (X) button — only allow tap-backdrop dismissal. */
  hideCloseButton?: boolean;
  /** ARIA label when no title is set. */
  ariaLabel?: string;
}

/**
 * Bottom sheet for mobile. Backdrop dismisses; ESC dismisses; body scroll
 * locked while open. Drag-to-dismiss intentionally not implemented for MVP.
 */
export function Sheet({
  open,
  onClose,
  title,
  description,
  footer,
  maxHeight = '90vh',
  children,
  className,
  hideCloseButton = false,
  ariaLabel,
}: SheetProps) {
  const panelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    // Focus the panel for keyboard users.
    panelRef.current?.focus();
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center"
      role="dialog"
      aria-modal="true"
      aria-label={typeof title === 'string' ? title : ariaLabel}
    >
      <button
        type="button"
        aria-label="Close sheet"
        onClick={onClose}
        className={cn(
          'absolute inset-0 bg-soil-900/55 backdrop-blur-[2px]',
          'animate-fade-in cursor-default',
        )}
      />
      <div
        ref={panelRef}
        tabIndex={-1}
        style={{ maxHeight }}
        className={cn(
          'relative w-full max-w-screen-sm',
          'bg-bloom-50 text-soil-900',
          'rounded-sheet shadow-sheet',
          'animate-sheet-in flex flex-col',
          'pb-[env(safe-area-inset-bottom,0)]',
          className,
        )}
      >
        {/* Grab handle */}
        <div className="flex justify-center pt-2.5 pb-1">
          <span className="block h-1 w-10 rounded-full bg-soil-300/80" />
        </div>
        {(title || description || !hideCloseButton) && (
          <div className="flex items-start gap-3 px-5 pt-2 pb-3 border-b border-soil-100">
            <div className="flex-1 min-w-0">
              {title && (
                <h2 className="font-serif text-2xl leading-tight text-soil-900 truncate">
                  {title}
                </h2>
              )}
              {description && (
                <p className="text-sm text-soil-500 mt-0.5">{description}</p>
              )}
            </div>
            {!hideCloseButton && (
              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                className={cn(
                  'shrink-0 -mr-1.5 -mt-1 inline-flex h-9 w-9 items-center justify-center',
                  'rounded-full text-soil-500 hover:bg-soil-100',
                  'focus-visible:shadow-focus',
                )}
              >
                <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
                  <path
                    d="M4 4l10 10M14 4L4 14"
                    stroke="currentColor"
                    strokeWidth="1.75"
                    strokeLinecap="round"
                  />
                </svg>
              </button>
            )}
          </div>
        )}
        <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer && (
          <div className="border-t border-soil-100 px-5 py-3 bg-soil-50/60">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}

export type SheetBodyProps = HTMLAttributes<HTMLDivElement>;

export default Sheet;
