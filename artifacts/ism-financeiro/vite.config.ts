import {execSync} from "node:child_process";
import {defineConfig} from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";
import runtimeErrorOverlay from "@replit/vite-plugin-runtime-error-modal";

function gitCurto(): string {
    try {
        return execSync("git rev-parse --short HEAD", {encoding: "utf8"}).trim() || "local";
    } catch {
        return "local";
    }
}

const port = Number(process.env.PORT) || 5173;
const basePath = process.env.BASE_PATH || "/";

export default defineConfig({
    base: basePath,
    define: {
        "import.meta.env.VITE_APP_COMMIT": JSON.stringify(process.env.VITE_APP_COMMIT || gitCurto()),
        "import.meta.env.VITE_APP_BUILD": JSON.stringify(process.env.VITE_APP_BUILD || new Date().toISOString().slice(0, 16)),
    },
    plugins: [
        react(),
        tailwindcss(),
        runtimeErrorOverlay(),
        ...(process.env.NODE_ENV !== "production" &&
        process.env.REPL_ID !== undefined
            ? [
                await import("@replit/vite-plugin-cartographer").then((m) =>
                    m.cartographer({
                        root: path.resolve(import.meta.dirname, ".."),
                    }),
                ),
                await import("@replit/vite-plugin-dev-banner").then((m) =>
                    m.devBanner(),
                ),
            ]
            : []),
    ],
    resolve: {
        alias: {
            "@": path.resolve(import.meta.dirname, "src"),
            "@assets": path.resolve(import.meta.dirname, "..", "..", "attached_assets"),
        },
        dedupe: ["react", "react-dom"],
    },
    root: path.resolve(import.meta.dirname),
    build: {
        outDir: path.resolve(import.meta.dirname, "dist"),
        emptyOutDir: true,
    },
    server: {
        port,
        host: "0.0.0.0",
        proxy: {
            "/api": {
                target: "http://localhost:5000",
                changeOrigin: true,
            },
        },
        fs: {
            strict: true,
            deny: ["**/.*"],
        },
    },
    preview: {
        port,
        host: "0.0.0.0",
        allowedHosts: true,
    },
});