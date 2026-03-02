import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, __dirname, "VITE_");
  const projectId = env.VITE_FIREBASE_PROJECT_ID || "demo-project";

  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },
    build: {
      rollupOptions: {
        output: {
          manualChunks: {
            vendor: ["react", "react-dom", "react-router-dom"],
            charts: ["recharts"],
            firebase: ["firebase/app", "firebase/auth", "firebase/firestore"],
            query: ["@tanstack/react-query"],
          },
        },
      },
    },
    server: {
      proxy: {
        "/api": {
          target: "http://127.0.0.1:5001",
          changeOrigin: true,
          rewrite: (p) => `/${projectId}/us-central1/api${p}`,
        },
      },
    },
    test: {
      environment: "jsdom",
      setupFiles: "./src/test/setup.ts",
      css: true,
    },
  };
});
