import React from "react";
import ReactDOM from "react-dom/client";

import { App } from "./App";
import { OfflineStatusDock } from "./OfflineStatusDock";
import "./styles.css";
import "./ticket-authority.css";
import "./site-rejection.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
    <OfflineStatusDock />
  </React.StrictMode>,
);
