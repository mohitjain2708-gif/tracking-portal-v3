import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

const UI_PREFERENCE_STORAGE_KEY = "tracking-portal-ui-preference";
const DEFAULT_UI_PREFERENCE = "classic";
const UIPreferenceContext = createContext(null);

function sanitizePreference(value) {
  return value === "premium" ? "premium" : DEFAULT_UI_PREFERENCE;
}

function readStoredPreference() {
  if (typeof window === "undefined") {
    return DEFAULT_UI_PREFERENCE;
  }

  try {
    return sanitizePreference(window.localStorage.getItem(UI_PREFERENCE_STORAGE_KEY));
  } catch {
    return DEFAULT_UI_PREFERENCE;
  }
}

export function UIPreferenceProvider({ children }) {
  const [preference, setPreferenceState] = useState(readStoredPreference);

  useEffect(() => {
    if (typeof document !== "undefined") {
      document.documentElement.dataset.portalUi = preference;
    }

    if (typeof window !== "undefined") {
      try {
        window.localStorage.setItem(UI_PREFERENCE_STORAGE_KEY, preference);
      } catch {
        // Ignore storage failures so the UI remains usable in restricted environments.
      }
    }
  }, [preference]);

  const setPreference = useCallback((nextPreference) => {
    setPreferenceState(sanitizePreference(nextPreference));
  }, []);

  const togglePreference = useCallback(() => {
    setPreferenceState((current) => (current === "premium" ? "classic" : "premium"));
  }, []);

  const value = useMemo(
    () => ({
      preference,
      isPremium: preference === "premium",
      setPreference,
      togglePreference,
    }),
    [preference, setPreference, togglePreference]
  );

  return <UIPreferenceContext.Provider value={value}>{children}</UIPreferenceContext.Provider>;
}

export function useUIPreference() {
  const context = useContext(UIPreferenceContext);
  if (!context) {
    throw new Error("useUIPreference must be used inside UIPreferenceProvider");
  }
  return context;
}

export function UIPreferenceSegmentedControl({ className = "", label = "Interface" }) {
  const { preference, setPreference } = useUIPreference();

  return (
    <div className={`ui-preference-switch ${className}`.trim()} aria-label="Switch interface style">
      <span className="ui-preference-label">{label}</span>
      <div className="ui-preference-buttons" role="group" aria-label="Choose interface style">
        <button
          type="button"
          className={preference === "classic" ? "is-active" : ""}
          onClick={() => setPreference("classic")}
        >
          Classic
        </button>
        <button
          type="button"
          className={preference === "premium" ? "is-active" : ""}
          onClick={() => setPreference("premium")}
        >
          New Premium
        </button>
      </div>
    </div>
  );
}

