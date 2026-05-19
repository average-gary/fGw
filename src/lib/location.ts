/**
 * SPEC-010 — optional location capture for onboarding.
 *
 * Stores approximate location (geohash precision 5 by default, ~5 km cells —
 * see SPEC § 3.4). Used to pre-fill the geohash field on listings and piles
 * (SPEC-019). Persisted to localStorage so the user doesn't have to re-grant
 * the browser permission on every boot.
 */
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { encode } from './geohash';

export const DEFAULT_LOCATION_PRECISION = 5 as const;

interface LocationStateValues {
  enabled: boolean;
  lat?: number;
  lon?: number;
  geohash?: string;
  precision: number;
}

interface LocationActions {
  /**
   * Request the browser's geolocation, encode at `precision`, and persist.
   * Resolves on success, rejects with the `GeolocationPositionError`-shaped
   * error (or a generic Error if the API isn't available).
   */
  requestLocation: (precision?: number) => Promise<void>;
  clearLocation: () => void;
}

export type LocationState = LocationStateValues & LocationActions;

export const useLocationStore = create<LocationState>()(
  persist(
    (set, get) => ({
      enabled: false,
      precision: DEFAULT_LOCATION_PRECISION,

      async requestLocation(precision?: number) {
        const p = precision ?? get().precision ?? DEFAULT_LOCATION_PRECISION;
        if (
          typeof navigator === 'undefined' ||
          !navigator.geolocation ||
          typeof navigator.geolocation.getCurrentPosition !== 'function'
        ) {
          throw new Error('Geolocation API unavailable in this environment.');
        }
        const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
          navigator.geolocation.getCurrentPosition(
            (p2) => resolve(p2),
            (err) => reject(err),
            { enableHighAccuracy: false, timeout: 15_000, maximumAge: 60_000 },
          );
        });
        const { latitude, longitude } = pos.coords;
        const geohash = encode(latitude, longitude, p);
        set({
          enabled: true,
          lat: latitude,
          lon: longitude,
          geohash,
          precision: p,
        });
      },

      clearLocation() {
        set({
          enabled: false,
          precision: DEFAULT_LOCATION_PRECISION,
          lat: undefined,
          lon: undefined,
          geohash: undefined,
        });
      },
    }),
    {
      name: 'compost.location',
      storage: createJSONStorage(() => localStorage),
      partialize: (s) =>
        ({
          enabled: s.enabled,
          lat: s.lat,
          lon: s.lon,
          geohash: s.geohash,
          precision: s.precision,
        }) as Partial<LocationState>,
    },
  ),
);

/** Hook returning the current location state + actions. */
export function useLocation(): LocationState {
  return useLocationStore();
}

/** Imperative helpers (e.g. for non-component code). */
export function requestLocation(precision?: number): Promise<void> {
  return useLocationStore.getState().requestLocation(precision);
}
export function clearLocation(): void {
  useLocationStore.getState().clearLocation();
}
