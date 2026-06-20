import { defineConfig } from "@trigger.dev/sdk/v3";
import { prismaExtension } from "@trigger.dev/build/extensions/prisma";

export default defineConfig({
  project: process.env.TRIGGER_PROJECT_ID ?? "proj_fesycxsknmzsdljllfcu",
  runtime: "node",
  logLevel: "info",
  maxDuration: 120,
  dirs: ["./src/trigger"],
  build: {
    extensions: [
      // The binaryTargets entry in schema.prisma gets Prisma to *generate*
      // the right query engine binary, but esbuild (Trigger.dev's bundler)
      // doesn't know to copy that native .so.node file alongside the bundled
      // task code on its own — that's what this extension actually does.
      prismaExtension({
        mode: "legacy", // we use the classic `prisma-client-js` provider, not the newer `prisma-client` one
        schema: "prisma/schema.prisma",
        clientGenerator: "client", // matches `generator client { ... }` in schema.prisma
      }),
    ],
  },
});