import { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";
import type { Express, Request, Response } from "express";
import * as db from "../db";
import { getSessionCookieOptions } from "./cookies";
import { sdk } from "./sdk";

function getQueryParam(req: Request, key: string): string | undefined {
  const value = req.query[key];
  return typeof value === "string" ? value : undefined;
}

/**
 * Parse the origin from the state parameter.
 * state is base64-encoded redirectUri, e.g.:
 *   btoa("https://platform.nplusonestudios.com/api/oauth/callback")
 * We extract the origin so we can redirect back to the correct domain.
 */
function parseOriginFromState(state: string): string | null {
  try {
    const decoded = Buffer.from(state, "base64").toString("utf-8");
    const url = new URL(decoded);
    return url.origin;
  } catch {
    return null;
  }
}

export function registerOAuthRoutes(app: Express) {
  app.get("/api/oauth/callback", async (req: Request, res: Response) => {
    const code = getQueryParam(req, "code");
    const state = getQueryParam(req, "state");

    if (!code || !state) {
      res.status(400).json({ error: "code and state are required" });
      return;
    }

    // Derive the frontend origin from state so redirect goes back to the correct domain
    // (e.g. platform.nplusonestudios.com instead of the internal sandbox host)
    const frontendOrigin =
      parseOriginFromState(state) ||
      `${req.protocol}://${req.get("x-forwarded-host") || req.get("host") || req.hostname}`;

    try {
      const tokenResponse = await sdk.exchangeCodeForToken(code, state);
      const userInfo = await sdk.getUserInfo(tokenResponse.accessToken);

      if (!userInfo.openId) {
        res.status(400).json({ error: "openId missing from user info" });
        return;
      }

      await db.upsertUser({
        openId: userInfo.openId,
        name: userInfo.name || null,
        email: userInfo.email ?? null,
        loginMethod: userInfo.loginMethod ?? userInfo.platform ?? null,
        lastSignedIn: new Date(),
      });

      // Check if user is approved to access the platform
      const user = await db.getUserByOpenId(userInfo.openId);
      if (!user?.approved) {
        // Not approved: still create session so they can see the pending page,
        // but redirect to the pending-approval page instead of the app
        const sessionToken = await sdk.createSessionToken(userInfo.openId, {
          name: userInfo.name || "",
          expiresInMs: ONE_YEAR_MS,
        });
        const cookieOptions = getSessionCookieOptions(req);
        res.cookie(COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: ONE_YEAR_MS });
        res.redirect(302, `${frontendOrigin}/pending-approval`);
        return;
      }

      const sessionToken = await sdk.createSessionToken(userInfo.openId, {
        name: userInfo.name || "",
        expiresInMs: ONE_YEAR_MS,
      });

      const cookieOptions = getSessionCookieOptions(req);
      res.cookie(COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: ONE_YEAR_MS });

      res.redirect(302, `${frontendOrigin}/`);
    } catch (error) {
      console.error("[OAuth] Callback failed", error);
      res.status(500).json({ error: "OAuth callback failed" });
    }
  });
}
