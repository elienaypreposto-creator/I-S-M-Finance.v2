// Vercel Serverless Function Entry Point at Root
// This redirects Vercel's standard API routing to our built API server.

const app = require("../artifacts/api-server/dist/index.cjs");

module.exports = typeof app === "function" ? app : app.default ?? app;
