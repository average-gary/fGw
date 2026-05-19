import {
  forwardRef,
  useCallback,
  useEffect,
  useId,
  useRef,
  type ReactNode,
  type TextareaHTMLAttributes,
} from 'react';
import { cn } from '@/lib/cn';

export type TextareaVariant = 'default' | 'filled';

export interface TextareaProps
  extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: ReactNode;
  helperText?: ReactNode;
  error?: ReactNode;
  variant?: TextareaVariant;
  /** When true, the textarea grows with content up to `maxRows`. */
  autoGrow?: boolean;
  /** Cap for autoGrow. Defaults to 10. */
  maxRows?: number;
  className?: string;
  textareaClassName?: string;
}

const VARIANT: Record<TextareaVariant, { wrap: string; focus: string }> = {
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

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  function Textarea(
    {
      label,
      helperText,
      error,
      variant = 'default',
      autoGrow = false,
      maxRows = 10,
      id,
      rows = 3,
      className,
      textareaClassName,
      disabled,
      required,
      onChange,
      value,
      defaultValue,
      ...rest
    },
    ref,
  ) {
    const reactId = useId();
    const textId = id ?? `textarea-${reactId}`;
    const helperId = helperText || error ? `${textId}-help` : undefined;
    const hasError = !!error;
    const v = VARIANT[variant];
    const innerRef = useRef<HTMLTextAreaElement | null>(null);

    const setRefs = useCallback(
      (node: HTMLTextAreaElement | null) => {
        innerRef.current = node;
        if (typeof ref === 'function') ref(node);
        else if (ref) ref.current = node;
      },
      [ref],
    );

    const resize = useCallback(() => {
      const el = innerRef.current;
      if (!el || !autoGrow) return;
      el.style.height = 'auto';
      const styles = window.getComputedStyle(el);
      const lineHeight = parseFloat(styles.lineHeight) || 20;
      const padY =
        parseFloat(styles.paddingTop) + parseFloat(styles.paddingBottom);
      const maxH = lineHeight * maxRows + padY;
      el.style.height = `${Math.min(el.scrollHeight, maxH)}px`;
      el.style.overflowY = el.scrollHeight > maxH ? 'auto' : 'hidden';
    }, [autoGrow, maxRows]);

    useEffect(() => {
      resize();
    }, [resize, value, defaultValue]);

    return (
      <div className={cn('flex flex-col gap-1.5', className)}>
        {label != null && (
          <label
            htmlFor={textId}
            className="text-sm font-medium text-soil-800 leading-tight"
          >
            {label}
            {required && <span className="text-harvest-600 ml-0.5">*</span>}
          </label>
        )}
        <div
          className={cn(
            'flex rounded-card overflow-hidden',
            'transition-[background-color,border-color,box-shadow] duration-100',
            v.wrap,
            v.focus,
            hasError &&
              '!border-harvest-500 focus-within:!ring-harvest-500/30 focus-within:!border-harvest-600',
            disabled && 'opacity-60 pointer-events-none',
          )}
        >
          <textarea
            id={textId}
            ref={setRefs}
            rows={rows}
            value={value as string | undefined}
            defaultValue={defaultValue}
            disabled={disabled}
            required={required}
            aria-invalid={hasError || undefined}
            aria-describedby={helperId}
            onChange={(e) => {
              onChange?.(e);
              resize();
            }}
            className={cn(
              'min-w-0 flex-1 bg-transparent px-3 py-2.5 text-base resize-y',
              'text-soil-900 placeholder:text-soil-400',
              'outline-none focus:outline-none',
              'leading-relaxed',
              autoGrow && 'resize-none',
              textareaClassName,
            )}
            {...rest}
          />
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
  },
);

export default Textarea;
