import path from "node:path";

export const PRIVATE_OBJECT_DIR = process.env.PRIVATE_OBJECT_DIR || "";
export const LOCAL_FALLBACK_DIR = path.join(process.cwd(), "uploads", ".private");

let useObjectStorage = !!PRIVATE_OBJECT_DIR && PRIVATE_OBJECT_DIR.endsWith("/.private");

export function hasObjectStorage(): boolean {
  return useObjectStorage;
}

export function disableObjectStorage() {
  console.warn("[STORAGE] Object storage disabled, using local fallback");
  useObjectStorage = false;
}

export function assertStorageEnv() {
  if (!PRIVATE_OBJECT_DIR) {
    console.warn("[STORAGE] PRIVATE_OBJECT_DIR not set, falling back to local storage");
    useObjectStorage = false;
    return;
  }
  if (!PRIVATE_OBJECT_DIR.endsWith("/.private")) {
    throw new Error(
      `PRIVATE_OBJECT_DIR must end with "/.private". Got: ${PRIVATE_OBJECT_DIR}`
    );
  }
}

export function jobPhotoKey(orgId: string, jobId: string, fileName: string) {
  return `job-photos/${orgId}/${jobId}/${fileName}`;
}

export function absolutePathForKey(key: string) {
  const storageDir = useObjectStorage ? PRIVATE_OBJECT_DIR : LOCAL_FALLBACK_DIR;
  return path.join(storageDir, key);
}
