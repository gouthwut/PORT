import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 1420,
    strictPort: true,
    host: "127.0.0.1",
    watch: {
      ignored: [
        "**/.local/**",
        "**/tools/**/bin/**",
        "**/tools/**/obj/**",
        "**/src-tauri/target/**",
      ],
    },
  },
  clearScreen: false,
});
