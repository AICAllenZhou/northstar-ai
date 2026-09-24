import { Component, type ErrorInfo, type ReactNode } from 'react'

interface Props { children: ReactNode; label?: string }
interface State { error: Error | null }

/** Last line of defence: a render error shows a message and a reload button, never a blank screen. */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('NORTHSTAR UI error', error, info.componentStack)
  }

  render(): ReactNode {
    if (!this.state.error) return this.props.children
    return (
      <div className="state-card danger" role="alert" style={{ margin: 16 }}>
        <h4>{this.props.label ?? 'This panel'} failed to render</h4>
        <div className="mono" style={{ fontSize: 12 }}>{this.state.error.message}</div>
        <div style={{ marginTop: 8, display: 'flex', gap: 8 }}>
          <button className="btn small" onClick={() => this.setState({ error: null })}>Try again</button>
          <button className="btn small ghost" onClick={() => window.location.reload()}>Reload page</button>
        </div>
      </div>
    )
  }
}
