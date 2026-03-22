import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import type { User } from "../../drizzle/schema";
import { sdk } from "./sdk";

export type TrpcContext = {
  req: CreateExpressContextOptions["req"];
  res: CreateExpressContextOptions["res"];
  user: User | null;
};

export async function createContext(
  opts: CreateExpressContextOptions
): Promise<TrpcContext> {
  let user: User | null = null;

  // If an Authorization header is present, the caller explicitly wants API Token auth.
  // In that case, propagate any auth errors (don't swallow them silently).
  const hasAuthHeader = !!(opts.req.headers.authorization || opts.req.headers["x-api-token"]);

  if (hasAuthHeader) {
    // Let auth errors propagate — invalid token should return 401, not silently fail
    user = await sdk.authenticateRequest(opts.req);
  } else {
    // No auth header — try cookie auth, but silently fall back to null for public procedures
    try {
      user = await sdk.authenticateRequest(opts.req);
    } catch (error) {
      // Authentication is optional for public procedures.
      user = null;
    }
  }

  return {
    req: opts.req,
    res: opts.res,
    user,
  };
}
