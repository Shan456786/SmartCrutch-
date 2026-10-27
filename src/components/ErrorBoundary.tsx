import { Component, type ErrorInfo, type ReactNode } from 'react';
import { clearAllAppData } from '../lib/storage';

interface State {
  error: Error | null;
}

/** Last-resort error screen so a corrupted local record never leaves the user with a blank page. */
export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('SmartCrutch+ crashed:', error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="crash">
        <h1>Something went wrong</h1>
        <p>SmartCrutch+ hit an unexpected error: {this.state.error.message}</p>
        <div className="crash-actions">
          <button className="btn btn-primary" onClick={() => window.location.reload()}>
            Reload app
          </button>
          <button
            className="btn btn-danger"
            onClick={() => {
              clearAllAppData();
              window.location.reload();
            }}
          >
            Clear local data and reload
          </button>
        </div>
      </div>
    );
  }
}
