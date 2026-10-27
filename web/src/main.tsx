import { createRoot } from "react-dom/client";
import "leaflet/dist/leaflet.css";
import "./tokens.css";
import "./styles.css";
import App from "./App";
createRoot(document.getElementById("root")!).render(<App />);
