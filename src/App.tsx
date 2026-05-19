import ComponentsRoute from './routes/_dev/Components';
import { Onboarding } from './routes/Onboarding';
import { useOnboarding } from './lib/onboarding';
import { ToastProvider } from './components/ui/Toast';

// TODO: replace ComponentsRoute with Feed when SPEC-018 lands.
export function App() {
  const completedAt = useOnboarding().completedAt;
  return (
    <ToastProvider>
      <main className="mx-auto w-full max-w-screen-sm">
        {completedAt === null ? <Onboarding /> : <ComponentsRoute />}
      </main>
    </ToastProvider>
  );
}

export default App;
