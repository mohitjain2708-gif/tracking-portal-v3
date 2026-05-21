import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import AppErrorBoundary from "./AppErrorBoundary";
import { UIPreferenceProvider } from "./ui/UIPreferenceContext";
import "./styles.css";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <UIPreferenceProvider>
      <AppErrorBoundary>
        <App />
      </AppErrorBoundary>
    </UIPreferenceProvider>
  </React.StrictMode>
);
