import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import "./styles/mobile.css";
import { setAuth } from "./lib/api";

// Set development auth headers for mobile schedule to work
if (import.meta.env.DEV) {
  setAuth("e9f55821-5377-4854-b0e4-68fef6064843", "4500ba4e-e575-4f82-b196-27dd4c7d0eaf");
}

createRoot(document.getElementById("root")!).render(<App />);
