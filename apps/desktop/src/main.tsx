import React from "react";
import ReactDOM from "react-dom/client";
// First, so the i18n instance exists before any component that translates
// through it — the error boundary included — is created.
import "./i18n";
import "./index.css";
import { AppToaster } from "./components/app-toaster";
import { ErrorBoundary } from "./components/error-boundary";
import { ThemeProvider } from "./components/theme-provider";
import { App } from "./App";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    {/* Outermost, so a throw in the theme provider is caught too rather than
        leaving a blank window. */}
    <ErrorBoundary>
      <ThemeProvider>
        <App />
        <AppToaster />
      </ThemeProvider>
    </ErrorBoundary>
  </React.StrictMode>,
);
