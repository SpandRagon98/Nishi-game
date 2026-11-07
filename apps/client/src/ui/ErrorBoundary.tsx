import { Component, type ReactNode } from 'react';

/** Keeps a UI fault from leaving the player on a blank screen. */
export class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  componentDidCatch(error: Error) {
    console.error('[nishi] UI error', error);
  }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="fatal">
        <h1>NISHI</h1>
        <p>Something went wrong: {this.state.error.message}</p>
        <button className="btn btn-primary" onClick={() => location.reload()}>Reload the game</button>
      </div>
    );
  }
}
