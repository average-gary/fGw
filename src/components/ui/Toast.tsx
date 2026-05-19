import { useEffect, type ReactNode } from 'react';
import { create } from 'zustand';
import { cn } from '@/lib/cn';

export type ToastVariant = 'default' | 'success' | 'warning' | 'danger';

export interface ToastInput {
  /** Headline. */
  title: string;
  /** Optional body text below the title. */
  description?: string;
  /** Visual treatment. */
  variant?: ToastVariant;
  /** Auto-dismiss after this many ms. Pass 0 to make sticky. Default 4500. */
  durationMs?: number;
  /** Optional action button rendered inline with the toast. */
  action?: { label: string; onClick: () => void };
}

export interface ToastRecord extends ToastInput {
  id: string;
  createdAt: number;
}

interface ToastStore {
  toasts: ToastRecord[];
  push: (t: ToastInput) => string;
  dismiss: (id: string) => void;
  clear: () => void;
}

const useToastStore = create<ToastStore>()((set) => ({
  toasts: [],
  push: (t) => {
    const id =
      (globalThis.crypto as Crypto | undefined)?.randomUUID?.() ??
      `t-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    set((s) => ({
      toasts: [
        ...s.toasts,
        { ...t, id, createdAt: Date.now(), variant: t.variant ?? 'default' },
      ],
    }));
    return id;
  },
  dismiss: (id) =>
    set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
  clear: () => set({ toasts: [] }),
}));

/** Hook returning a small API for raising/dismissing toasts. */
export function useToast() {
  const push = useToastStore((s) => s.push);
  const dismiss = useToastStore((s) => s.dismiss);
  const clear = useToastStore((s) => s.clear);
  return {
    toast: (input: ToastInput) => push(input),
    success: (title: string, description?: string) =>
      push({ title, description, variant: 'success' }),
    warning: (title: string, description?: string) =>
      push({ title, description, variant: 'warning' }),
    danger: (title: string, description?: string) =>
      push({ title, description, variant: 'danger' }),
    dismiss,
    clear,
  };
}

const VARIANT: Record<
  ToastVariant,
  { bg: string; bar: string; icon: ReactNode }
> = {
  default: {
    bg: 'bg-soil-800 text-bloom-50 border border-soil-700',
    bar: 'bg-bloom-200',
    icon: (
      <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
        <circle cx="9" cy="9" r="7.5" stroke="currentColor" strokeWidth="1.5" fill="none" />
        <path d="M9 5.5v4M9 12.2v0.1" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
      </svg>
    ),
  },
  success: {
    bg: 'bg-moss-700 text-bloom-50 border border-moss-800',
    bar: 'bg-moss-300',
    icon: (
      <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
        <path
          d="M3.5 9.5l3 3 8-7"
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
      </svg>
    ),
  },
  warning: {
    bg: 'bg-harvest-600 text-bloom-50 border border-harvest-700',
    bar: 'bg-bloom-200',
    icon: (
      <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
        <path
          d="M9 2.5l7 12.5H2L9 2.5z"
          stroke="currentColor"
          strokeWidth="1.5"
          fill="none"
          strokeLinejoin="round"
        />
        <path d="M9 7.5v3.5M9 13.2v0.1" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
      </svg>
    ),
  },
  danger: {
    bg: 'bg-harvest-800 text-bloom-50 border border-harvest-900',
    bar: 'bg-harvest-300',
    icon: (
      <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
        <circle cx="9" cy="9" r="7.5" stroke="currentColor" strokeWidth="1.5" fill="none" />
        <path d="M5.5 5.5l7 7M12.5 5.5l-7 7" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
      </svg>
    ),
  },
};

/** Single toast row. Self-dismisses after `durationMs`. */
function ToastItem({ toast }: { toast: ToastRecord }) {
  const dismiss = useToastStore((s) => s.dismiss);
  const duration = toast.durationMs ?? 4500;
  const v = VARIANT[toast.variant ?? 'default'];

  useEffect(() => {
    if (!duration) return;
    const t = setTimeout(() => dismiss(toast.id), duration);
    return () => clearTimeout(t);
  }, [duration, dismiss, toast.id]);

  return (
    <div
      role={toast.variant === 'danger' ? 'alert' : 'status'}
      aria-live={toast.variant === 'danger' ? 'assertive' : 'polite'}
      className={cn(
        'pointer-events-auto relative w-full max-w-sm overflow-hidden',
        'rounded-card shadow-paper',
        'animate-toast-in',
        v.bg,
      )}
    >
      <span className={cn('absolute left-0 top-0 h-full w-0.5', v.bar)} aria-hidden="true" />
      <div className="flex items-start gap-3 pl-3.5 pr-2 py-3">
        <span className="mt-0.5 shrink-0 opacity-90">{v.icon}</span>
        <div className="min-w-0 flex-1">
          <p className="font-medium text-sm leading-snug">{toast.title}</p>
          {toast.description && (
            <p className="text-sm leading-snug opacity-80 mt-0.5">
              {toast.description}
            </p>
          )}
          {toast.action && (
            <button
              type="button"
              onClick={() => {
                toast.action?.onClick();
                dismiss(toast.id);
              }}
              className={cn(
                'mt-2 inline-flex items-center text-xs font-medium uppercase tracking-eyebrow font-mono',
                'underline underline-offset-2 hover:opacity-90',
              )}
            >
              {toast.action.label}
            </button>
          )}
        </div>
        <button
          type="button"
          onClick={() => dismiss(toast.id)}
          aria-label="Dismiss"
          className="shrink-0 -mr-0.5 -mt-0.5 inline-flex h-7 w-7 items-center justify-center rounded-full hover:bg-white/10"
        >
          <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
            <path
              d="M3 3l8 8M11 3l-8 8"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          </svg>
        </button>
      </div>
    </div>
  );
}

/**
 * ToastProvider — mount once near the root. Renders a stack of active
 * toasts in a fixed-position container. No portal needed; high z-index
 * keeps it above sheets.
 */
export function ToastProvider({ children }: { children?: ReactNode }) {
  const toasts = useToastStore((s) => s.toasts);
  return (
    <>
      {children}
      <div
        aria-label="Notifications"
        className={cn(
          'pointer-events-none fixed inset-x-0 z-[60]',
          'bottom-[max(env(safe-area-inset-bottom,0),0.5rem)]',
          'flex flex-col items-center gap-2 px-3',
        )}
      >
        {toasts.map((t) => (
          <ToastItem key={t.id} toast={t} />
        ))}
      </div>
    </>
  );
}

export default ToastProvider;
