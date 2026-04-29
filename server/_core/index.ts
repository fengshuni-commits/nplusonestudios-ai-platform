import "dotenv/config";
import cron from "node-cron";
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
import { getOpenApiSpec } from "../openApiSpec";
import { registerStreamTranscribeWS } from "../streamTranscribe";

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

  // ─── Multipart file upload endpoint (for large files like PDF/PPT) ───
  // IMPORTANT: Must be registered BEFORE the /api alias for openclawRouter
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

  // ─── OpenAPI spec endpoint (no auth required) ───
  // IMPORTANT: Must be registered BEFORE the /api alias for openclawRouter
  app.get("/api/openapi.json", (req: any, res: any) => {
    const protocol = req.protocol || "https";
    const host = req.get("host") || "localhost:3000";
    const baseUrl = `${protocol}://${host}`;
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.json(getOpenApiSpec(baseUrl));
  });

  // tRPC API
  // IMPORTANT: Must be registered BEFORE the /api alias for openclawRouter
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    })
  );

  // OpenClaw RESTful API (for external integrations)
  // Mount at both /api/v1 (canonical) and /api (alias for backward-compat callers).
  // The /api alias MUST come AFTER /api/oauth, /api/upload, /api/openapi.json, /api/trpc
  // so those routes take priority and are not intercepted by openclawRouter's auth middleware.
  app.use("/api/v1", openclawRouter);
  app.use("/api", openclawRouter);
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

  // Register WebSocket streaming transcription endpoint
  registerStreamTranscribeWS(server);

  server.listen(port, () => {
    console.log(`Server running on http://localhost:${port}/`);
  });
}

startServer().catch(console.error);

// ─── Daily cron: auto-update task statuses at 00:01 Beijing time (UTC+8 = 16:01 UTC prev day) ───
// Cron runs at 16:01 UTC every day, which is 00:01 CST (Asia/Shanghai / Beijing time)
cron.schedule("1 16 * * *", async () => {
  try {
    console.log("[Cron] Running daily task status auto-update (Beijing 00:01)...");
    const { getDb } = await import("../db");
    const drizzleDb = await getDb();
    if (!drizzleDb) return;
    const { eq, ne } = await import("drizzle-orm");
    const { tasks } = await import("../../drizzle/schema");

    // Today's date string in Beijing time (UTC+8)
    const now = new Date();
    const todayStr = new Date(now.getTime() + 8 * 60 * 60 * 1000).toISOString().slice(0, 10);

    const allTasks = await drizzleDb.select().from(tasks).where(ne(tasks.status as any, "done"));
    let updated = 0;

    for (const task of allTasks) {
      let newStatus: string = task.status;

      // Rule 1: startDate is today or earlier and status is 'todo' → mark as 'in_progress'
      if (task.startDate && task.status === "todo") {
        const startStr = new Date(new Date(task.startDate).getTime() + 8 * 60 * 60 * 1000)
          .toISOString().slice(0, 10);
        if (startStr <= todayStr) {
          newStatus = "in_progress";
        }
      }

      // Rule 2: approval is true → mark as 'done'
      if ((task as any).approval === true && task.status !== "done") {
        newStatus = "done";
      }

      if (newStatus !== task.status) {
        await drizzleDb
          .update(tasks)
          .set({ status: newStatus as any, updatedAt: new Date() })
          .where(eq(tasks.id, task.id));
        updated++;
      }
    }

    console.log(`[Cron] Task status auto-update complete: ${updated} task(s) updated.`);
  } catch (err) {
    console.error("[Cron] Task status auto-update failed:", err);
  }
}, { timezone: "UTC" });
