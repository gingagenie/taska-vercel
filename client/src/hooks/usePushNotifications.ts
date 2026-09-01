import { useEffect } from "react";
import { isCapacitorApp } from "@/lib/platform-detection";
import { api } from "@/lib/api";

export function usePushNotifications(isAdmin: boolean) {
  useEffect(() => {
    if (!isAdmin || !isCapacitorApp()) return;

    // Dynamically import so web builds don't break if native plugin unavailable
    import("@capacitor/push-notifications")
      .then(({ PushNotifications }) => {
        PushNotifications.requestPermissions().then((result) => {
          if (result.receive === "granted") {
            PushNotifications.register();
          }
        });

        PushNotifications.addListener("registration", (token) => {
          api("/api/admin/push-tokens", {
            method: "POST",
            body: JSON.stringify({
              deviceToken: token.value,
              platform: "android",
            }),
          }).catch((e) => console.error("[push] Token registration failed:", e));
        });

        PushNotifications.addListener("registrationError", (err) => {
          console.error("[push] Registration error:", err);
        });

        PushNotifications.addListener("pushNotificationReceived", (notification) => {
          console.log("[push] Notification received:", notification);
        });

        PushNotifications.addListener("pushNotificationActionPerformed", (action) => {
          console.log("[push] Notification action:", action);
        });
      })
      .catch((e) => console.error("[push] PushNotifications plugin not available:", e));
  }, [isAdmin]);
}
