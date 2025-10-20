// Re-export the shared database client to avoid creating multiple connection pools
// This file exists for backwards compatibility with existing imports
export { db } from './db/client.js';