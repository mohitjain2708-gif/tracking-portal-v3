import React from "react";

export default class AppErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, errorInfo) {
    console.error("Portal UI crashed", error, errorInfo);
  }

  handleReload = () => {
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="app-crash-shell">
          <div className="app-crash-card">
            <p className="app-crash-eyebrow">We hit a temporary issue</p>
            <h1>The workspace needs a fresh start.</h1>
            <p>
              Nothing has been deleted. Please refresh the portal and continue from the same place.
            </p>
            <button type="button" className="app-crash-action" onClick={this.handleReload}>
              Reload portal
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
