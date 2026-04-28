import app from "./app";

const port = process.env.PORT || 5000;

// Only listen when not in a serverless environment (like Vercel)
// or when explicitly running in development.
if (process.env.NODE_ENV !== "production" || process.env.RUN_LOCAL === "true") {
  app.listen(port, () => {
    console.log(`Server listening on port ${port}`);
  });
}

// Export for Vercel serverless function
export default app;
