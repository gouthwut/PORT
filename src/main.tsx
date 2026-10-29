import React from "react";
import ReactDOM from "react-dom/client";
import { PreferencesProvider } from "./hub/preferences";
import App from "./App";
import "./styles.css";
import "./theme.css";
import "./hub/stage16.css";
import "./hub/stage18-liquid.css";
ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <PreferencesProvider>
      <App />
    </PreferencesProvider>
  </React.StrictMode>,
);
