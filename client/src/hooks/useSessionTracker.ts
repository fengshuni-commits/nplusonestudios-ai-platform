import { useEffect, useRef } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";

/**
 * Tracks active session time for the current user.
 * - Creates a session on mount (when user is logged in).
 * - Sends a heartbeat every 30 seconds while the tab is visible.
 * - Stops heartbeats when the tab is hidden (user is away).
 */
export function useSessionTracker() {
  const { user } = useAuth();
  const sessionIdRef = useRef<number | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const startMutation = trpc.session.start.useMutation({
    onSuccess: (data) => {
      sessionIdRef.current = data.sessionId;
    },
  });

  const heartbeatMutation = trpc.session.heartbeat.useMutation();

  useEffect(() => {
    if (!user) return;

    // Start a new session
    startMutation.mutate();

    const sendHeartbeat = () => {
      if (sessionIdRef.current !== null && document.visibilityState === "visible") {
        heartbeatMutation.mutate({ sessionId: sessionIdRef.current });
      }
    };

    // Send heartbeat every 30 seconds
    intervalRef.current = setInterval(sendHeartbeat, 30_000);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);
}
