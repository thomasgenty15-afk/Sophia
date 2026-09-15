import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import "./preview.css";
import { FamiliesPage } from "./FamiliesPage.copy";
createRoot(document.getElementById("root")!).render(
  <StrictMode><BrowserRouter><FamiliesPage /></BrowserRouter></StrictMode>,
);
