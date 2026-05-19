import ComponentsRoute from './routes/_dev/Components';

// TODO: replace with Feed when SPEC-018 lands.
export function App() {
  return (
    <main className="mx-auto w-full max-w-screen-sm">
      <ComponentsRoute />
    </main>
  );
}

export default App;
