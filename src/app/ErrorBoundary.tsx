import { Component, type ReactNode } from 'react';

export class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  componentDidCatch(error: Error) { console.error(error); }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div role="alert" className="mx-auto max-w-xl rounded-xl border border-danger/40 bg-danger/5 p-6">
        <h1 className="text-lg font-semibold text-danger">Something went wrong on this page</h1>
        <p className="mt-2 text-sm text-muted">Your saved progress is safe (it is stored locally). Try reloading. If it keeps happening, export a backup from Settings.</p>
        <pre className="mt-3 overflow-auto rounded bg-surface-2 p-2 text-xs">{this.state.error.message}</pre>
        <div className="mt-4 flex gap-2">
          <button className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-fg" onClick={() => this.setState({ error: null })}>Try again</button>
          <a className="rounded-lg border border-border px-4 py-2 text-sm" href={import.meta.env.BASE_URL}>Go to dashboard</a>
        </div>
      </div>
    );
  }
}
