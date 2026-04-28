// Vercel Serverless Function Entry Point
// References the pre-built esbuild bundle so workspace imports are resolved.
// The dist/index.cjs is built first by `pnpm run build`, then this file is processed.

// eslint-disable-next-line @typescript-eslint/no-require-imports
const app = require("../dist/index.cjs");

module.exports = typeof app === "function" ? app : app.default ?? app;
