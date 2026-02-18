import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

const params = new URLSearchParams(window.location.search);
if (params.get("debug_supabase") === "1") {
  localStorage.setItem("debug_supabase", "1");
}
if (params.get("debug_supabase") === "0") {
  localStorage.removeItem("debug_supabase");
}

// Initialize theme from localStorage
const savedTheme = localStorage.getItem("theme");
if (savedTheme === "dark") {
  document.documentElement.classList.add("dark");
}

createRoot(document.getElementById("root")!).render(<App />);
