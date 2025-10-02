import fs from "node:fs/promises";
import path from "node:path";
import { absolutePathForKey, hasObjectStorage, disableObjectStorage } from "./paths";
import { logStorage } from "./log";

export async function storageSelfTest() {
  const key = `self-test/${Date.now()}-ping.txt`;
  const abs = absolutePathForKey(key);

  try {
    await fs.mkdir(path.dirname(abs), { recursive: true });
    await fs.writeFile(abs, "pong", "utf8");
    const got = await fs.readFile(abs, "utf8");

    if (got !== "pong") {
      logStorage("SELFTEST_FAIL", { key });
      throw new Error("Storage self-test mismatch");
    }
    
    const storageType = hasObjectStorage() ? "object storage" : "local fallback";
    logStorage("SELFTEST_OK", { key, storage: storageType });
  } catch (error: any) {
    if (error?.code === "ENOENT" || error?.code === "EACCES") {
      // Object storage not available - disable it and try fallback
      const wasUsingObjectStorage = hasObjectStorage();
      if (wasUsingObjectStorage) {
        disableObjectStorage();
        console.warn("[STORAGE] Object storage unavailable, switching to local fallback");
        
        // Retry with fallback
        const fallbackAbs = absolutePathForKey(key);
        try {
          await fs.mkdir(path.dirname(fallbackAbs), { recursive: true });
          await fs.writeFile(fallbackAbs, "pong", "utf8");
          const got = await fs.readFile(fallbackAbs, "utf8");
          
          if (got === "pong") {
            logStorage("SELFTEST_OK", { key, storage: "local fallback (after object storage failed)" });
            return;
          }
        } catch (fallbackError: any) {
          console.error("[STORAGE] Local fallback also failed:", fallbackError.message);
          logStorage("SELFTEST_FAIL", { key, error: fallbackError.message });
          throw fallbackError;
        }
      }
      
      logStorage("SELFTEST_SKIPPED", { key, reason: error.message });
    } else {
      throw error;
    }
  }
}
