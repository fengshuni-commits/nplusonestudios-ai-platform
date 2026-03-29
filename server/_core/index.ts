import "dotenv/config";
import express from "express";
import { createServer } from "http";
import net from "net";
import multer from "multer";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { serveStatic, setupVite } from "./vite";
import { openclawRouter } from "../openclawApi";
import { storagePut } from "../storage";
import { nanoid } from "nanoid";
import { sdk } from "./sdk";

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const server = net.createServer();
    server.listen(port, () => {
      server.close(() => resolve(true));
    });
    server.on("error", () => resolve(false));
  });
}

async function findAvailablePort(startPort: number = 3000): Promise<number> {
  for (let port = startPort; port < startPort + 20; port++) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`No available port found starting from ${startPort}`);
}

async function startServer() {
  const app = express();
  const server = createServer(app);
  // Trust reverse proxy (nginx/Cloudflare/Manus edge) so req.protocol reflects
  // the original HTTPS scheme. Without this, sameSite=none cookies are set with
  // secure=false and browsers silently reject them, causing login loops.
  app.set("trust proxy", 1);
  // Extend timeout for long-running AI inference requests (e.g. reasoning models)
  server.timeout = 300000; // 5 minutes
  server.keepAliveTimeout = 305000;
  server.headersTimeout = 310000;
  // Configure body parser with larger size limit for file uploads
  app.use(express.json({ limit: "200mb" }));
  app.use(express.urlencoded({ limit: "200mb", extended: true }));
  // OAuth callback under /api/oauth/callback
  registerOAuthRoutes(app);
  // OpenClaw RESTful API (for external integrations)
  app.use("/api/v1", openclawRouter);

  // ─── Multipart file upload endpoint (for large files like PDF/PPT) ───
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 200 * 1024 * 1024 }, // 200MB
  });
  app.post("/api/upload/layout-pack", upload.single("file"), async (req: any, res: any) => {
    try {
      // Verify session via sdk
      let user: any = null;
      try {
        user = await sdk.authenticateRequest(req);
      } catch {
        return res.status(401).json({ error: "Unauthorized" });
      }
      if (!user) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      if (!req.file) {
        return res.status(400).json({ error: "No file provided" });
      }
      const { originalname, mimetype, buffer } = req.file;
      const key = `layout-packs/${nanoid()}-${originalname}`;
      const { url } = await storagePut(key, buffer, mimetype);
      return res.json({ url, key, fileName: originalname, contentType: mimetype });
    } catch (err: any) {
      console.error("[Upload] Layout pack upload failed:", err);
      return res.status(500).json({ error: err?.message || "Upload failed" });
    }
  });

  // tRPC API
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    })
  );
  // development mode uses Vite, production mode uses static files
  if (process.env.NODE_ENV === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  const preferredPort = parseInt(process.env.PORT || "3000");
  const port = await findAvailablePort(preferredPort);

  if (port !== preferredPort) {
    console.log(`Port ${preferredPort} is busy, using port ${port} instead`);
  }

  server.listen(port, () => {
    console.log(`Server running on http://localhost:${port}/`);
  });
}

startServer().catch(console.error);
