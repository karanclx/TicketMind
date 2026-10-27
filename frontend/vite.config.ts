import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"

export default defineConfig({
  plugins: [react()],
  root: "frontend",
  server: {
    port: 5173,
    proxy: {
      "/support": "http://localhost:3000",
      "/auth": "http://localhost:3000",
      "/billing": { target: "http://localhost:3000", bypass: (req) => req.headers.accept?.includes("text/html") ? req.url : undefined },
      "/tickets": { target: "http://localhost:3000", bypass: (req) => req.headers.accept?.includes("text/html") ? req.url : undefined },
      "/health": "http://localhost:3000"
    }
  },
  build: {
    outDir: "../frontend-dist",
    emptyOutDir: true
  }
})
