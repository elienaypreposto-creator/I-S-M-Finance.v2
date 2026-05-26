// @ts-ignore
process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
import app from "./app";

const port = process.env.PORT || 5000;

// Only listen when not in a serverless environment (like Vercel)
// or when explicitly running in development.
if (process.env.NODE_ENV !== "production" || process.env.RUN_LOCAL === "true") {
  const server = app.listen(port, () => {
    console.log(`Server listening on port ${port}`);
  });

  server.on("error", (error: any) => {
    if (error.code === "EADDRINUSE") {
      console.error(`ERROR: Port ${port} is already in use.`);
      console.error("The server is likely already running in another terminal.");
      process.exit(1);
    } else {
      console.error("Server error:", error);
    }
  });
}

// Export for Vercel serverless function
export default app;
