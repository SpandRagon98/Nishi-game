import { createRoot } from 'react-dom/client';
import { App } from './App';
import { ErrorBoundary } from './ui/ErrorBoundary';
import './styles.css';

// StrictMode is intentionally not used: its double-mount would tear down and recreate the
// Rapier character controllers and WebGL resources on every mount in development.
createRoot(document.getElementById('root')!).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>,
);

if (import.meta.env.DEV) {
  // dev-only inspection hook for automated play-testing
  void Promise.all([import('./game/runtime'), import('./state/store')]).then(([r, s]) => {
    (window as unknown as Record<string, unknown>).__nishi = { runtime: r.runtime, app: s.useApp };
  });
}
