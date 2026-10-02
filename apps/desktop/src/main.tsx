import React from "react";
import ReactDOM from "react-dom/client";
import { AppToaster } from "./components/app-toaster";
import { ThemeProvider } from "./components/theme-provider";
import { App } from "./App";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ThemeProvider>
      <App />
      <AppToaster />
    </ThemeProvider>
  </React.StrictMode>,
);
