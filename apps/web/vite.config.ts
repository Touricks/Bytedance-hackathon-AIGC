import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), [
    "PUBLIC_",
    "SERVER_PORT",
    "VITE_",
    "WEB_ALLOWED_HOSTS",
    "WEB_PORT",
  ]);
  return {
    envPrefix: ["PUBLIC_", "SERVER_", "VITE_"],
    plugins: [react()],
    server: {
      port: Number(env.WEB_PORT ?? process.env.WEB_PORT ?? 5173),
      // Allow tunnel hostnames (e.g. Cloudflare Tunnel) when WEB_ALLOWED_HOSTS
      // is set: "true" allows any host, otherwise a comma-separated list.
      allowedHosts:
        (env.WEB_ALLOWED_HOSTS ?? process.env.WEB_ALLOWED_HOSTS) === "true"
          ? true
          : (env.WEB_ALLOWED_HOSTS ?? process.env.WEB_ALLOWED_HOSTS)
              ?.split(",")
              .map((host) => host.trim())
              .filter(Boolean),
    },
  };
});
