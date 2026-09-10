"use client";

import { useEffect, useState } from "react";

import { networkNotice } from "./pwa-model";

export function PwaRuntime() {
  const [online, setOnline] = useState(true);

  useEffect(() => {
    const updateNetworkState = () => setOnline(navigator.onLine);
    const initialUpdate = window.setTimeout(updateNetworkState, 0);
    window.addEventListener("online", updateNetworkState);
    window.addEventListener("offline", updateNetworkState);

    if (process.env.NODE_ENV === "production" && "serviceWorker" in navigator) {
      void navigator.serviceWorker.register("/sw.js", {
        scope: "/",
        updateViaCache: "none",
      }).catch(() => undefined);
    }

    return () => {
      window.clearTimeout(initialUpdate);
      window.removeEventListener("online", updateNetworkState);
      window.removeEventListener("offline", updateNetworkState);
    };
  }, []);

  const notice = networkNotice(online);
  if (!notice.visible) return null;

  return (
    <div className="network-status" role="status" aria-live="polite">
      <span aria-hidden="true" />
      {notice.label}
    </div>
  );
}
