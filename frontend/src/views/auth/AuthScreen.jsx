export default function AuthScreen({
  mode,
  form,
  loading,
  feedback,
  serviceState,
  onModeChange,
  onFieldChange,
  onSubmit,
}) {
  const serviceHint =
    serviceState === "warming"
      ? "Secure portal is waking up in the background. First sign-in can take a little longer."
      : serviceState === "slow"
        ? "The secure portal is responding slowly right now. Sign-in will keep waiting longer than usual."
        : "";

  return (
    <main className="auth-shell">
      <section className="auth-card">
        <p className="eyebrow">Secure Access</p>
        <h1>Shipment Manager Portal</h1>
        <p className="auth-copy">Sign in to work in your own shipment workspace.</p>
        {serviceHint ? (
          <div className={`auth-service-note auth-service-note-${serviceState}`}>{serviceHint}</div>
        ) : null}
        <form className="auth-form" onSubmit={onSubmit}>
          <label>
            <span>Email</span>
            <input
              type="email"
              value={form.email}
              onChange={(event) => onFieldChange("email", event.target.value)}
              placeholder="owner@trackingportal.app"
              autoComplete="username"
              required
            />
          </label>
          <label>
            <span>Password</span>
            <input
              type="password"
              value={form.password}
              onChange={(event) => onFieldChange("password", event.target.value)}
              placeholder="Enter your password"
              autoComplete={mode === "login" ? "current-password" : "new-password"}
              required
            />
          </label>
          {mode === "register" && (
            <label>
              <span>Confirm Password</span>
              <input
                type="password"
                value={form.confirmPassword}
                onChange={(event) => onFieldChange("confirmPassword", event.target.value)}
                placeholder="Confirm your password"
                autoComplete="new-password"
                required
              />
            </label>
          )}
          <button type="submit" className="button button-primary auth-submit" disabled={loading}>
            {loading ? "Connecting..." : mode === "login" ? "Sign In" : "Create Account"}
          </button>
        </form>
        {feedback ? <div className={`feedback feedback-${feedback.tone}`}>{feedback.text}</div> : null}
        <div className="auth-switch">
          <span>{mode === "login" ? "Need an account?" : "Already have an account?"}</span>
          <button type="button" className="auth-link" onClick={onModeChange}>
            {mode === "login" ? "Create one" : "Sign in"}
          </button>
        </div>
      </section>
    </main>
  );
}
