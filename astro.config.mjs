import react from "@astrojs/react";
import tailwind from "@astrojs/tailwind";
import node from "@astrojs/node";
import vercel from "@astrojs/vercel/serverless"; // O el que estés usando
import { defineConfig } from "astro/config";

const isVercelBuild = process.env.VERCEL === "1" || process.env.VERCEL === "true";

export default defineConfig({
  integrations: [tailwind(), react()],
  output: "server",
  site: process.env.PUBLIC_SITE_URL ?? "http://localhost:4321",
  adapter: isVercelBuild
    ? vercel({
        webAnalytics: { enabled: true },
      })
    : node({ mode: "standalone" }),
});
