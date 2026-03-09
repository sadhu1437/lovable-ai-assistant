import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { hydrateAllCaches } from "@/lib/audioCache";

// Render immediately for fast first paint, then hydrate caches in the background
createRoot(document.getElementById("root")!).render(<App />);

const hydrate = () => {
  hydrateAllCaches().catch(() => {});
};

if ("requestIdleCallback" in window) {
  (window as any).requestIdleCallback(hydrate);
} else {
  setTimeout(hydrate, 0);
}

// Register service worker for PWA
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  });
}
