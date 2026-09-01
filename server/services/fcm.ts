import { GoogleAuth } from "google-auth-library";
import { db } from "../db/client";
import { sql } from "drizzle-orm";

const FCM_SCOPE = "https://www.googleapis.com/auth/firebase.messaging";

let _auth: GoogleAuth | null = null;

function getGoogleAuth(): GoogleAuth | null {
  if (!process.env.FIREBASE_PROJECT_ID || !process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
    return null;
  }
  if (!_auth) {
    let credentials: object;
    try {
      credentials = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
    } catch {
      console.error("[FCM] Invalid FIREBASE_SERVICE_ACCOUNT_JSON — must be valid JSON");
      return null;
    }
    _auth = new GoogleAuth({ credentials, scopes: FCM_SCOPE });
  }
  return _auth;
}

async function getFcmAccessToken(): Promise<string | null> {
  const auth = getGoogleAuth();
  if (!auth) return null;
  const client = await auth.getClient();
  const tokenResponse = await client.getAccessToken();
  return tokenResponse.token || null;
}

export async function sendAdminPushNotification(opts: {
  title: string;
  body: string;
  data?: Record<string, string>;
}): Promise<void> {
  const projectId = process.env.FIREBASE_PROJECT_ID;
  if (!projectId || !process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
    console.log("[FCM] Skipping push — FIREBASE_PROJECT_ID or FIREBASE_SERVICE_ACCOUNT_JSON not configured");
    return;
  }

  const accessToken = await getFcmAccessToken();
  if (!accessToken) {
    console.error("[FCM] Could not obtain access token");
    return;
  }

  // Fetch all registered admin device tokens
  let tokens: Array<{ device_token: string; platform: string }> = [];
  try {
    const rows: any = await db.execute(sql`SELECT device_token, platform FROM admin_push_tokens`);
    tokens = Array.isArray(rows) ? rows : [];
  } catch (e) {
    console.error("[FCM] Failed to fetch admin_push_tokens:", e);
    return;
  }

  if (tokens.length === 0) {
    console.log("[FCM] No admin push tokens registered, skipping");
    return;
  }

  const url = `https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`;

  for (const { device_token } of tokens) {
    try {
      const body: Record<string, any> = {
        message: {
          token: device_token,
          notification: { title: opts.title, body: opts.body },
        },
      };
      if (opts.data) {
        body.message.data = opts.data;
      }

      const res = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const errText = await res.text().catch(() => "");
        console.error(`[FCM] Failed for token ${device_token.slice(0, 10)}...: ${res.status} ${errText}`);
      } else {
        console.log(`[FCM] Push sent to token ${device_token.slice(0, 10)}...`);
      }
    } catch (e) {
      console.error(`[FCM] Error sending to token ${device_token.slice(0, 10)}...:`, e);
    }
  }
}
