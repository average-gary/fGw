/**
 * SPEC-030 — App shell + bottom nav.
 *
 * Renders a sticky bottom navigation bar with five primary destinations
 * (Feed / Calendar / Map / Inbox / Settings) and an `<Outlet/>` for the
 * matched nested route. Routes that take the full viewport (NewListing,
 * NewPile) have their own back button and hide the bar via `hideBottomBar`.
 *
 * Bottom-bar icons are inline 24-px SVG glyphs — no icon dependency. The
 * active item gets a `bg-soil-100` chip via `<NavLink>`'s `isActive`.
 */
import type { ReactNode } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { cn } from '@/lib/cn';

interface NavItem {
  to: string;
  label: string;
  /** Match `/calendar` *and* `/calendar/whatever` etc. */
  matchPrefix?: boolean;
  icon: ReactNode;
}

// 24-px stroke icons. `currentColor` so the active chip can recolor them.
function FeedIcon(): ReactNode {
  return (
    <svg
      width={24}
      height={24}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M4 6h16" />
      <path d="M4 12h16" />
      <path d="M4 18h10" />
    </svg>
  );
}

function CalendarIcon(): ReactNode {
  return (
    <svg
      width={24}
      height={24}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="3.5" y="5" width="17" height="15" rx="2" />
      <path d="M3.5 10h17" />
      <path d="M8 3.5v3" />
      <path d="M16 3.5v3" />
    </svg>
  );
}

function MapIcon(): ReactNode {
  return (
    <svg
      width={24}
      height={24}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 21s-7-6.2-7-11a7 7 0 1 1 14 0c0 4.8-7 11-7 11Z" />
      <circle cx="12" cy="10" r="2.5" />
    </svg>
  );
}

function InboxIcon(): ReactNode {
  return (
    <svg
      width={24}
      height={24}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M4 13l3-7h10l3 7" />
      <path d="M4 13v5a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-5" />
      <path d="M4 13h4l1.5 2h5l1.5-2h4" />
    </svg>
  );
}

function SettingsIcon(): ReactNode {
  return (
    <svg
      width={24}
      height={24}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1.04 1.56V21a2 2 0 0 1-4 0v-.09a1.7 1.7 0 0 0-1.04-1.56 1.7 1.7 0 0 0-1.87.34l-.06.06A2 2 0 1 1 4.2 16.92l.06-.06a1.7 1.7 0 0 0 .34-1.87 1.7 1.7 0 0 0-1.56-1.04H3a2 2 0 0 1 0-4h.09A1.7 1.7 0 0 0 4.65 8.91a1.7 1.7 0 0 0-.34-1.87l-.06-.06A2 2 0 1 1 7.08 4.15l.06.06a1.7 1.7 0 0 0 1.87.34H9a1.7 1.7 0 0 0 1.04-1.56V3a2 2 0 0 1 4 0v.09a1.7 1.7 0 0 0 1.04 1.56 1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.7 1.7 0 0 0-.34 1.87V9a1.7 1.7 0 0 0 1.56 1.04H21a2 2 0 0 1 0 4h-.09a1.7 1.7 0 0 0-1.51 1.04Z" />
    </svg>
  );
}

const NAV_ITEMS: NavItem[] = [
  { to: '/', label: 'Feed', icon: <FeedIcon /> },
  { to: '/calendar', label: 'Calendar', matchPrefix: true, icon: <CalendarIcon /> },
  { to: '/map', label: 'Map', icon: <MapIcon /> },
  { to: '/inbox', label: 'Inbox', icon: <InboxIcon /> },
  { to: '/settings', label: 'Settings', matchPrefix: true, icon: <SettingsIcon /> },
];

/**
 * Routes whose UI takes the full viewport. The bottom bar is hidden so
 * their own primary CTA / back button isn't crowded.
 */
const FULL_VIEWPORT_PATTERNS: RegExp[] = [
  /^\/listings\/new$/,
  /^\/piles\/new$/,
];

function shouldHideBottomBar(pathname: string): boolean {
  return FULL_VIEWPORT_PATTERNS.some((re) => re.test(pathname));
}

export function BottomNav(): ReactNode {
  return (
    <nav
      aria-label="Primary"
      className={cn(
        'sticky bottom-0 z-40 mt-auto flex items-center justify-around',
        'border-t border-soil-200 bg-bloom-50/95 backdrop-blur',
        'px-2 py-1.5',
        'pb-[max(env(safe-area-inset-bottom,0),0.375rem)]',
      )}
    >
      {NAV_ITEMS.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={!item.matchPrefix}
          className={({ isActive }) =>
            cn(
              'flex min-w-[56px] flex-col items-center gap-0.5',
              'rounded-card px-3 py-1.5 text-[10px] font-mono uppercase tracking-wide',
              'transition-colors',
              isActive
                ? 'bg-soil-100 text-soil-900'
                : 'text-soil-600 hover:bg-soil-50',
            )
          }
        >
          {item.icon}
          <span>{item.label}</span>
        </NavLink>
      ))}
    </nav>
  );
}

export function AppShell(): ReactNode {
  const { pathname } = useLocation();
  const hideBar = shouldHideBottomBar(pathname);
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-screen-sm flex-col">
      <div className="flex flex-1 flex-col">
        <Outlet />
      </div>
      {!hideBar && <BottomNav />}
    </div>
  );
}

export default AppShell;
