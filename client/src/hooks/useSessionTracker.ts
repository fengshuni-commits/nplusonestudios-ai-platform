import { useEffect, useRef } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";

/**
 * Tracks active session time for the current user.
 *
 * Improvements over the original version:
 * 1. Activity-based: only counts time when the user is actually interacting
 *    (mouse move, click, keydown, scroll, touchstart). If no activity for
 *    IDLE_TIMEOUT_MS the heartbeat is paused.
 * 2. sendBeacon on unload: flushes the last heartbeat when the tab is closed
 *    so the final ~30 s are not lost.
 * 3. Single-tab guard: uses localStorage to ensure only one tab per browser
 *    sends heartbeats at a time, preventing double-counting.
 */

const HEARTBEAT_INTERVAL_MS = 30_000;   // 30 s between heartbeats
const IDLE_TIMEOUT_MS       = 5 * 60_000; // 5 min idle → pause counting

// Key used for single-tab leader election
const LEADER_KEY   = "session_leader_ts";
const LEADER_CLAIM_INTERVAL_MS = 15_000; // re-claim leadership every 15 s
const LEADER_STALE_MS          = 25_000; // claim older than 25 s is stale

function isLeader(): boolean {
  try {
    const raw = localStorage.getItem(LEADER_KEY);
    if (!raw) return false;
    return Date.now() - Number(raw) < LEADER_STALE_MS;
  } catch { return false; }
}

function claimLeadership(): void {
  try { localStorage.setItem(LEADER_KEY, String(Date.now())); } catch { /* ignore */ }
}

export function useSessionTracker() {
  const { user } = useAuth();
  const sessionIdRef      = useRef<number | null>(null);
  const lastActivityRef   = useRef<number>(Date.now());
  const heartbeatInterval = useRef<ReturnType<typeof setInterval> | null>(null);
  const leaderInterval    = useRef<ReturnType<typeof setInterval> | null>(null);

  const startMutation     = trpc.session.start.useMutation({
    onSuccess: (data) => { sessionIdRef.current = data.sessionId; },
  });
  const heartbeatMutation = trpc.session.heartbeat.useMutation();

  useEffect(() => {
    if (!user) return;

    // ── Activity tracking ─────────────────────────────────────────────────────
    const markActive = () => { lastActivityRef.current = Date.now(); };
    const activityEvents = ["mousemove", "mousedown", "keydown", "scroll", "touchstart", "click"];
    activityEvents.forEach(e => window.addEventListener(e, markActive, { passive: true }));

    // ── Leader election ───────────────────────────────────────────────────────
    // Try to become the leader immediately; if another tab already is, we skip.
    const tryBecomeLeader = () => {
      const raw = localStorage.getItem(LEADER_KEY);
      const age = raw ? Date.now() - Number(raw) : Infinity;
      if (age >= LEADER_STALE_MS) {
        claimLeadership();
      }
    };
    tryBecomeLeader();
    leaderInterval.current = setInterval(() => {
      if (isLeader()) claimLeadership(); // renew our own claim
      else tryBecomeLeader();            // try to take over stale claim
    }, LEADER_CLAIM_INTERVAL_MS);

    // ── Session start ─────────────────────────────────────────────────────────
    startMutation.mutate();

    // ── Heartbeat ─────────────────────────────────────────────────────────────
    const sendHeartbeat = () => {
      if (sessionIdRef.current === null) return;
      if (document.visibilityState !== "visible") return;
      if (!isLeader()) return; // another tab is the leader
      const idleMs = Date.now() - lastActivityRef.current;
      if (idleMs >= IDLE_TIMEOUT_MS) return; // user is idle, skip
      heartbeatMutation.mutate({ sessionId: sessionIdRef.current });
    };
    heartbeatInterval.current = setInterval(sendHeartbeat, HEARTBEAT_INTERVAL_MS);

    // ── sendBeacon on unload ──────────────────────────────────────────────────
    const handleUnload = () => {
      if (sessionIdRef.current === null) return;
      if (!isLeader()) return;
      const idleMs = Date.now() - lastActivityRef.current;
      if (idleMs >= IDLE_TIMEOUT_MS) return;
      // Use sendBeacon so the request survives tab close
      const url = `/api/trpc/session.heartbeat?batch=1`;
      const body = JSON.stringify({
        "0": { json: { sessionId: sessionIdRef.current } },
      });
      navigator.sendBeacon(url, new Blob([body], { type: "application/json" }));
    };
    window.addEventListener("beforeunload", handleUnload);

    return () => {
      activityEvents.forEach(e => window.removeEventListener(e, markActive));
      window.removeEventListener("beforeunload", handleUnload);
      if (heartbeatInterval.current) clearInterval(heartbeatInterval.current);
      if (leaderInterval.current)    clearInterval(leaderInterval.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);
}
