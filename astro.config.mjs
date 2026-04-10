import react from "@astrojs/react";
import tailwind from "@astrojs/tailwind";
import vercel from "@astrojs/vercel/serverless"; // O el que estés usando
import { defineConfig } from "astro/config";

export default defineConfig({
  integrations: [tailwind(), react()],
  output: "server",
  site: "https://uniformes-medicos.vercel.app",
  adapter: vercel({
    webAnalytics: { enabled: true },
    // ESTO ES LO QUE SOLUCIONA TU ERROR:
    runtime: "nodejs20.x",
  }),
});
