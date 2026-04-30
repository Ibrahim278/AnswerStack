import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import fs from "fs";

const certPath = path.resolve(__dirname, "../certs/cert.pem");
const keyPath = path.resolve(__dirname, "../certs/key.pem");
const hasCerts = !process.env.VITE_NO_HTTPS && fs.existsSync(certPath) && fs.existsSync(keyPath);

// https://vitejs.dev/config/
export default defineConfig({
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
    ...(hasCerts && {
      https: {
        cert: fs.readFileSync(certPath),
        key: fs.readFileSync(keyPath),
      },
    }),
    proxy: {
      '/api': { target: `${hasCerts ? 'https' : 'http'}://localhost:8000`, changeOrigin: true, secure: false },
      '/health': { target: `${hasCerts ? 'https' : 'http'}://localhost:8000`, changeOrigin: true, secure: false },
    },
  },
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
    dedupe: ["react", "react-dom", "react/jsx-runtime", "react/jsx-dev-runtime"],
  },
});
