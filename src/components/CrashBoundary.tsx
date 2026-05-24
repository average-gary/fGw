/**
 * Crash boundary (Phase 2): catch render-phase errors in the React tree
 * and persist them via the same on-device queue used by the window-level
 * handlers in `@/lib/crashReports`.
 *
 * Function components can't be error boundaries — `componentDidCatch` and
 * `getDerivedStateFromError` are class-only React APIs.
 *
 * The fallback UI deliberately stays minimal: the user already saw their
 * action fail, so the goal is to acknowledge the crash and offer a clean
 * exit (Reload). The Phase 4 boot prompt will offer to send the queued
 * report on next launch.
 */
import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Card, CardSubtitle, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { enqueueReport } from '@/lib/crashReports';

export interface CrashBoundaryProps {
  children: ReactNode;
}

interface CrashBoundaryState {
  hasError: boolean;
}

export class CrashBoundary extends Component<
  CrashBoundaryProps,
  CrashBoundaryState
> {
  override state: CrashBoundaryState = { hasError: false };

  static getDerivedStateFromError(): CrashBoundaryState {
    return { hasError: true };
  }

  override componentDidCatch(error: Error, _info: ErrorInfo): void {
    // Persist via the shared queue. `enqueueReport` is exception-safe.
    enqueueReport(error);
  }

  private handleReload = (): void => {
    if (typeof window !== 'undefined' && typeof window.location?.reload === 'function') {
      window.location.reload();
    }
  };

  override render(): ReactNode {
    if (!this.state.hasError) {
      return this.props.children;
    }
    return (
      <main className="mx-auto flex min-h-dvh w-full max-w-screen-sm flex-col px-5 py-6 gap-4">
        <Card>
          <CardTitle>Something went wrong.</CardTitle>
          <CardSubtitle>
            The app hit an unexpected error. Reload to recover.
          </CardSubtitle>
          <div className="mt-4">
            <Button onClick={this.handleReload}>Reload</Button>
          </div>
        </Card>
      </main>
    );
  }
}

export default CrashBoundary;
