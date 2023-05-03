import { createRoot } from "react-dom/client";

import App from "./App.jsx";
import "./colors.css";
import "./style.css";

if (navigator.serviceWorker) {
  navigator.serviceWorker
    .register("/sw.js")
    .then((reg) => console.log("Service Worker Registered", reg))
    .catch((swErr) => console.log(`Service Worker Installation Error: ${swErr}}`));
}

const rootElement = document.getElementById("root");
const root = createRoot(rootElement);

root.render(<App />);
