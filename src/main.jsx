import React from "react";
import { createRoot } from "react-dom/client";
import SpriteStudio from "./components/SpriteStudio.jsx";
import "./index.css";

const root = createRoot(document.getElementById("root"));
root.render(
  <React.StrictMode>
    <SpriteStudio />
  </React.StrictMode>
);
