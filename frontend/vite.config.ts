import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"

export default defineConfig({
  plugins: [react()],
  root: "frontend",
  server: {
    port: 5173,
    proxy: {
      "/tickets": "http://localhost:3000",
      "/health": "http://localhost:3000"
    }
  },
  build: {
    outDir: "../frontend-dist",
    emptyOutDir: true
  }
})
