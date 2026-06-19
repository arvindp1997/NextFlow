import { defineConfig } from "@trigger.dev/sdk/v3";

export default defineConfig({
  project: process.env.TRIGGER_PROJECT_ID ?? "proj_fesycxsknmzsdljllfcu",
  runtime: "node",
  logLevel: "info",
  maxDuration: 120,
  dirs: ["./src/trigger"],
});
