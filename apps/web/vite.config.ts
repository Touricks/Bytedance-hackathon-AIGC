import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const webRoot = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(webRoot, "../..");

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, repoRoot, [
    "PUBLIC_",
    "SERVER_PORT",
    "VITE_",
    "WEB_PORT",
  ]);
  return {
    envDir: repoRoot,
    envPrefix: ["PUBLIC_", "SERVER_", "VITE_"],
    plugins: [react()],
    server: {
      port: Number(env.WEB_PORT ?? process.env.WEB_PORT ?? 5173),
    },
  };
});
