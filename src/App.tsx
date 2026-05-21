/**
 * SPEC-030 — App root + router.
 *
 * Wires every route from the Wave-6 SPECs into a `<HashRouter>` (HashRouter
 * so the same bundle works equally well from `file://` in Tauri *and* from
 * a static web host without server-side rewrites).
 *
 * Onboarding gating: when `useOnboarding().completedAt === null`, the
 * onboarding flow renders instead of any matched route. The `<ToastProvider>`
 * wraps the entire tree either way.
 *
 * Lazy-loading: the heavier routes (Map / Learn / NewPile / PileDetail / all
 * `/admin/*`) are split out via `React.lazy`. `_dev/components` is also
 * lazy-loaded since it's only useful during visual debugging. Suspense
 * fallback is the standard `<Spinner/>`.
 */
import { lazy, Suspense, useEffect, useRef, type ReactNode } from 'react';
import {
  HashRouter,
  MemoryRouter,
  Navigate,
  Route,
  Routes,
  useNavigate,
  useParams,
} from 'react-router-dom';

import { ToastProvider } from '@/components/ui/Toast';
import { Spinner } from '@/components/ui/Spinner';
import { AppShell } from '@/components/AppShell';
import { useOnboarding } from '@/lib/onboarding';
import { startMembershipPoller, stopMembershipPoller } from '@/lib/pyramid';
import { Onboarding } from '@/routes/Onboarding';
import { Feed } from '@/routes/Feed';
import { Calendar } from '@/routes/Calendar';
import { MyPiles } from '@/routes/MyPiles';
import { Profile } from '@/routes/Profile';
import { Inbox } from '@/routes/Inbox';
import { NewListing } from '@/routes/NewListing';
import { ListingDetail } from '@/routes/ListingDetail';
import { Settings } from '@/routes/settings/Settings';
import { ChapterSwitch } from '@/routes/settings/ChapterSwitch';
import {
  LISTING_EVENT_KIND,
  type AddressableRef,
} from '@/lib/listings/types';
import { PILE_EVENT_KIND } from '@/lib/pile/events';

// Heavier routes — split into their own chunks.
const Map = lazy(() =>
  import('@/routes/Map').then((m) => ({ default: m.Map })),
);
const Learn = lazy(() =>
  import('@/routes/Learn').then((m) => ({ default: m.Learn })),
);
const NewPile = lazy(() =>
  import('@/routes/NewPile').then((m) => ({ default: m.NewPile })),
);
const PileDetail = lazy(() =>
  import('@/routes/PileDetail').then((m) => ({ default: m.PileDetail })),
);
const Members = lazy(() =>
  import('@/routes/admin/Members').then((m) => ({ default: m.Members })),
);
const InviteTree = lazy(() =>
  import('@/routes/admin/InviteTree').then((m) => ({ default: m.InviteTree })),
);
const Banned = lazy(() =>
  import('@/routes/admin/Banned').then((m) => ({ default: m.Banned })),
);
const RequestInvite = lazy(() =>
  import('@/routes/admin/RequestInvite').then((m) => ({
    default: m.RequestInvite,
  })),
);
const ComponentsRoute = lazy(() => import('@/routes/_dev/Components'));

// Param parsing helpers ------------------------------------------------------
const HEX64 = /^[0-9a-f]{64}$/i;

function isValidPubkey(pk: string | undefined): pk is string {
  return !!pk && HEX64.test(pk);
}

function isValidDSlug(d: string | undefined): d is string {
  return !!d && d.length > 0;
}

// Per-route wrapper components — translate router params + callbacks. -------

function ListingDetailRoute(): ReactNode {
  const params = useParams<'authorPubkey' | 'dSlug'>();
  const navigate = useNavigate();
  if (!isValidPubkey(params.authorPubkey) || !isValidDSlug(params.dSlug)) {
    return <Navigate to="/" replace />;
  }
  const listingRef: AddressableRef = {
    kind: LISTING_EVENT_KIND,
    pubkey: params.authorPubkey,
    d: params.dSlug,
  };
  return <ListingDetail listingRef={listingRef} onBack={() => navigate(-1)} />;
}

function PileDetailRoute(): ReactNode {
  const params = useParams<'authorPubkey' | 'dSlug'>();
  const navigate = useNavigate();
  if (!isValidPubkey(params.authorPubkey) || !isValidDSlug(params.dSlug)) {
    return <Navigate to="/" replace />;
  }
  const pileRef: AddressableRef = {
    kind: PILE_EVENT_KIND,
    pubkey: params.authorPubkey,
    d: params.dSlug,
  };
  return <PileDetail pileRef={pileRef} onBack={() => navigate(-1)} />;
}

function ProfileRoute(): ReactNode {
  const params = useParams<'pubkey'>();
  const navigate = useNavigate();
  // No pubkey → own profile; otherwise validate the pubkey param.
  if (params.pubkey !== undefined && !isValidPubkey(params.pubkey)) {
    return <Navigate to="/profile" replace />;
  }
  if (params.pubkey === undefined) {
    return <Profile onBack={() => navigate(-1)} />;
  }
  return <Profile pubkey={params.pubkey} onBack={() => navigate(-1)} />;
}

function NewListingRoute(): ReactNode {
  const navigate = useNavigate();
  return (
    <NewListing
      onPublished={() => navigate('/')}
      onCancel={() => navigate(-1)}
      onRequestInvite={() => navigate('/admin/request-invite')}
    />
  );
}

function NewPileRoute(): ReactNode {
  const navigate = useNavigate();
  return (
    <NewPile
      onPublished={() => navigate('/piles')}
      onCancel={() => navigate(-1)}
      onRequestInvite={() => navigate('/admin/request-invite')}
    />
  );
}

function MyPilesRoute(): ReactNode {
  const navigate = useNavigate();
  const onSelect = (ref: AddressableRef): void => {
    navigate(`/piles/${ref.pubkey}/${ref.d}`);
  };
  return <MyPiles onSelect={onSelect} onBack={() => navigate(-1)} />;
}

function CalendarRoute(): ReactNode {
  const navigate = useNavigate();
  return <Calendar onBack={() => navigate(-1)} />;
}

function MapRoute(): ReactNode {
  const navigate = useNavigate();
  return (
    <Map
      onOpenListing={(ref) =>
        navigate(`/listings/${ref.pubkey}/${ref.d}`)
      }
      onOpenEvent={() => navigate('/calendar')}
    />
  );
}

function InboxRoute(): ReactNode {
  const navigate = useNavigate();
  return <Inbox onBack={() => navigate(-1)} />;
}

function SettingsRoute(): ReactNode {
  const navigate = useNavigate();
  // Settings fires `onSwitchedChapter` from a `useEffect([relay])` which
  // executes once on mount. We only want to redirect when the relay
  // *actually changes*, so swallow the first invocation.
  const firedOnce = useRef(false);
  return (
    <Settings
      onBack={() => navigate(-1)}
      onChangeChapter={() => navigate('/settings/chapter')}
      onSwitchedChapter={() => {
        if (!firedOnce.current) {
          firedOnce.current = true;
          return;
        }
        navigate('/');
      }}
    />
  );
}

function ChapterSwitchRoute(): ReactNode {
  const navigate = useNavigate();
  return (
    <ChapterSwitch
      onCancel={() => navigate(-1)}
      onSwitched={() => navigate('/')}
    />
  );
}

function LearnRoute(): ReactNode {
  const navigate = useNavigate();
  return <Learn onBack={() => navigate(-1)} />;
}

function MembersRoute(): ReactNode {
  const navigate = useNavigate();
  return <Members onBack={() => navigate(-1)} />;
}

function InviteTreeRoute(): ReactNode {
  const navigate = useNavigate();
  return <InviteTree onBack={() => navigate(-1)} />;
}

function BannedRoute(): ReactNode {
  const navigate = useNavigate();
  return <Banned onBack={() => navigate(-1)} />;
}

function RequestInviteRoute(): ReactNode {
  const navigate = useNavigate();
  return <RequestInvite onBack={() => navigate(-1)} />;
}

// ---------------------------------------------------------------------------
// AppRoutes — the inner shell that maps URLs to components. Exported so
// tests can mount it inside a `<MemoryRouter>` with a chosen initial path.
// ---------------------------------------------------------------------------
export function AppRoutes(): ReactNode {
  const completedAt = useOnboarding().completedAt;
  // SPEC-050: start the Pyramid membership poller once the user has
  // completed onboarding (no point polling before a chapter relay is
  // configured). `startMembershipPoller` is idempotent; the cleanup stops
  // it on unmount so tests don't leak timers across files.
  useEffect(() => {
    if (completedAt === null) return;
    startMembershipPoller();
    return () => stopMembershipPoller();
  }, [completedAt]);
  if (completedAt === null) {
    return <Onboarding />;
  }
  return (
    <Suspense
      fallback={
        <div className="flex min-h-dvh items-center justify-center" role="status">
          <Spinner size="lg" />
        </div>
      }
    >
      <Routes>
        <Route element={<AppShell />}>
          <Route index element={<Feed />} />
          <Route path="listings/new" element={<NewListingRoute />} />
          <Route
            path="listings/:authorPubkey/:dSlug"
            element={<ListingDetailRoute />}
          />
          <Route path="calendar" element={<CalendarRoute />} />
          <Route path="map" element={<MapRoute />} />
          <Route path="piles" element={<MyPilesRoute />} />
          <Route path="piles/new" element={<NewPileRoute />} />
          <Route
            path="piles/:authorPubkey/:dSlug"
            element={<PileDetailRoute />}
          />
          <Route path="profile" element={<ProfileRoute />} />
          <Route path="profile/:pubkey" element={<ProfileRoute />} />
          <Route path="inbox" element={<InboxRoute />} />
          <Route path="settings" element={<SettingsRoute />} />
          <Route path="settings/chapter" element={<ChapterSwitchRoute />} />
          <Route path="learn" element={<LearnRoute />} />
          <Route path="admin/members" element={<MembersRoute />} />
          <Route path="admin/tree" element={<InviteTreeRoute />} />
          <Route path="admin/banned" element={<BannedRoute />} />
          <Route
            path="admin/request-invite"
            element={<RequestInviteRoute />}
          />
          <Route path="_dev/components" element={<ComponentsRoute />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </Suspense>
  );
}

// ---------------------------------------------------------------------------
// Production root — uses `<HashRouter>` so the same bundle works from
// `file://` in Tauri and from a static web host.
// ---------------------------------------------------------------------------
export function App(): ReactNode {
  return (
    <ToastProvider>
      <HashRouter>
        <AppRoutes />
      </HashRouter>
    </ToastProvider>
  );
}

// ---------------------------------------------------------------------------
// Test helper — same routes inside a `<MemoryRouter>` so suites can pick
// the initial path without monkey-patching `window.location`.
// ---------------------------------------------------------------------------
export function AppForTest({
  initialEntries = ['/'],
}: {
  initialEntries?: string[];
} = {}): ReactNode {
  return (
    <ToastProvider>
      <MemoryRouter initialEntries={initialEntries}>
        <AppRoutes />
      </MemoryRouter>
    </ToastProvider>
  );
}

export default App;
