import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { getHTTPAdapter } from './db/http-adapter';

// Support both HTTP API and TCP modes
const useHTTP = process.env.USE_SUPABASE_HTTP === 'true';

let db: any;

if (useHTTP) {
  console.log('🌐 [db.ts] Using Supabase HTTP API mode');
  const httpAdapter = getHTTPAdapter();
  
  // Create a minimal compatible db object
  db = {
    from: (tableName: string) => ({
      select: (columns?: any) => httpAdapter.select(tableName, { select: columns }),
      insert: (data: any) => ({ values: (values: any) => httpAdapter.insert(tableName, values) }),
      update: (data: any) => ({ where: (condition: any) => httpAdapter.update(tableName, data, condition) }),
      delete: () => ({ where: (condition: any) => httpAdapter.delete(tableName, condition) })
    }),
    execute: (query: any) => httpAdapter.query(query.toString()),
    transaction: async (callback: any) => {
      const tx = await httpAdapter.begin();
      try {
        const result = await callback(tx);
        await tx.commit();
        return result;
      } catch (error) {
        await tx.rollback();
        throw error;
      }
    }
  };
} else {
  // Traditional TCP mode
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL not set");
  }
  
  const client = postgres(process.env.DATABASE_URL);
  db = drizzle(client);
}

export { db };