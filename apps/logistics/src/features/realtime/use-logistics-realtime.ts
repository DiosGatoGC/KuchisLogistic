"use client";

import type { LogisticsRealtimeTopic } from "@kuchis/shared/logistics-realtime";
import { useEffect, useMemo, useRef, useState } from "react";

import { useAuth } from "@/features/auth/auth-context";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

import {
  connectionStatusAction,
  eventInvalidatesTopic,
  eventsForTopic,
  type RealtimeConnectionState,
} from "./logistics-realtime-model";
import { createInvalidationCoordinator } from "./realtime-invalidation-coordinator";

interface UseLogisticsRealtimeOptions {
  topics: readonly LogisticsRealtimeTopic[];
  onInvalidate: () => void | Promise<unknown>;
  enabled?: boolean;
}

export function useLogisticsRealtime({
  topics,
  onInvalidate,
  enabled = true,
}: UseLogisticsRealtimeOptions): RealtimeConnectionState {
  const { status, user, getAccessToken } = useAuth();
  const callbackRef = useRef(onInvalidate);
  const [connectionState, setConnectionState] = useState<RealtimeConnectionState>("connecting");
  const topicKey = useMemo(() => [...new Set(topics)].sort().join("|"), [topics]);

  useEffect(() => {
    callbackRef.current = onInvalidate;
  }, [onInvalidate]);

  useEffect(() => {
    const uniqueTopics = topicKey ? topicKey.split("|") as LogisticsRealtimeTopic[] : [];
    const client = getSupabaseBrowserClient();
    if (!enabled || status !== "authenticated" || !user || !client || uniqueTopics.length === 0) {
      return;
    }

    let active = true;
    const coordinator = createInvalidationCoordinator(() => callbackRef.current());
    const channels: ReturnType<typeof client.channel>[] = [];

    const refreshOnResume = () => {
      if (document.visibilityState === "visible") coordinator.schedule();
    };
    const refreshOnOnline = () => coordinator.refreshNow();
    document.addEventListener("visibilitychange", refreshOnResume);
    window.addEventListener("online", refreshOnOnline);

    const subscribe = async () => {
      try {
        const accessToken = await getAccessToken();
        if (!active) return;
        await client.realtime.setAuth(accessToken);
        if (!active) return;

        for (const topic of uniqueTopics) {
          let channel = client.channel(topic, { config: { private: true } });
          for (const event of eventsForTopic(topic)) {
            channel = channel.on("broadcast", { event }, (message) => {
              if (eventInvalidatesTopic(topic, message.payload)) coordinator.schedule();
            });
          }
          channel = channel.subscribe((nextStatus) => {
              if (!active) return;
              const action = connectionStatusAction(nextStatus);
              setConnectionState(action.state);
              if (action.refresh) coordinator.schedule();
          });
          channels.push(channel);
        }
      } catch {
        if (active) setConnectionState("delayed");
      }
    };

    void subscribe();

    return () => {
      active = false;
      coordinator.dispose();
      document.removeEventListener("visibilitychange", refreshOnResume);
      window.removeEventListener("online", refreshOnOnline);
      for (const channel of channels) void client.removeChannel(channel);
    };
  }, [enabled, getAccessToken, status, topicKey, user]);

  return enabled && status === "authenticated" && user
    ? connectionState
    : "connecting";
}
