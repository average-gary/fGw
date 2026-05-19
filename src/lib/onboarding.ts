/**
 * SPEC-010 — onboarding completion gate.
 *
 * Tiny zustand store that records when the user finished the onboarding
 * flow. The App root reads this on every boot to decide whether to render
 * `<Onboarding/>` or the post-login route.
 */
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

interface OnboardingState {
  completedAt: number | null;
  markComplete: () => void;
  reset: () => void;
}

export const useOnboardingStore = create<OnboardingState>()(
  persist(
    (set) => ({
      completedAt: null,
      markComplete: () => set({ completedAt: Date.now() }),
      reset: () => set({ completedAt: null }),
    }),
    {
      name: 'compost.onboarding',
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({ completedAt: s.completedAt }) as Partial<OnboardingState>,
    },
  ),
);

/** Hook variant for components. */
export function useOnboarding(): OnboardingState {
  return useOnboardingStore();
}

/** Imperative helpers. */
export function markComplete(): void {
  useOnboardingStore.getState().markComplete();
}
export function reset(): void {
  useOnboardingStore.getState().reset();
}
