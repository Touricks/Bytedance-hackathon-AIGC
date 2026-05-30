import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), [
    "PUBLIC_",
    "SERVER_PORT",
    "VITE_",
    "WEB_PORT",
  ]);
  return {
    envPrefix: ["PUBLIC_", "SERVER_", "VITE_"],
    plugins: [react()],
    server: {
      port: Number(env.WEB_PORT ?? process.env.WEB_PORT ?? 5173),
    },
  };
});
