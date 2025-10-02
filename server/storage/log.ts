export function logStorage(event: string, data: Record<string, any>) {
  try {
    console.log(`[STORAGE] ${event} ${JSON.stringify(data)}`);
  } catch {
    console.log(`[STORAGE] ${event} <unserializable>`);
  }
}
