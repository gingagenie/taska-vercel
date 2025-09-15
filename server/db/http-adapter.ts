import { createClient, SupabaseClient } from '@supabase/supabase-js';

// HTTP adapter for Supabase using REST API instead of direct PostgreSQL connection
// This bypasses network connectivity issues with TCP connections to Supabase pooler

let supabaseClient: SupabaseClient | null = null;

export function createSupabaseHTTPClient() {
  if (supabaseClient) {
    return supabaseClient;
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variables');
  }

  supabaseClient = createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });

  return supabaseClient;
}

// Minimal HTTP adapter that provides the basic database operations needed
export class SupabaseHTTPAdapter {
  private client: SupabaseClient;

  constructor() {
    this.client = createSupabaseHTTPClient();
  }

  // Basic query method for raw SQL (limited in REST API)
  async query(sql: string, params?: any[]) {
    // Note: Raw SQL is limited in Supabase REST API
    // Most operations should use the table/RPC methods below
    throw new Error('Raw SQL queries not supported in HTTP adapter. Use table operations instead.');
  }

  // Table operations using PostgREST
  async select(tableName: string, options?: any) {
    let query = this.client.from(tableName).select(options?.select || '*');
    
    if (options?.where) {
      for (const [key, value] of Object.entries(options.where)) {
        query = query.eq(key, value);
      }
    }
    
    if (options?.limit) {
      query = query.limit(options.limit);
    }

    const { data, error } = await query;
    if (error) throw error;
    return { rows: data || [] };
  }

  async insert(tableName: string, data: any) {
    const { data: result, error } = await this.client
      .from(tableName)
      .insert(data)
      .select();
    
    if (error) throw error;
    return { rows: result || [] };
  }

  async update(tableName: string, data: any, where: any) {
    let query = this.client.from(tableName).update(data);
    
    for (const [key, value] of Object.entries(where)) {
      query = query.eq(key, value);
    }
    
    const { data: result, error } = await query.select();
    if (error) throw error;
    return { rows: result || [] };
  }

  async delete(tableName: string, where: any) {
    let query = this.client.from(tableName).delete();
    
    for (const [key, value] of Object.entries(where)) {
      query = query.eq(key, value);
    }
    
    const { data: result, error } = await query;
    if (error) throw error;
    return { rows: result || [] };
  }

  // RPC calls for complex operations
  async rpc(functionName: string, params?: any) {
    const { data, error } = await this.client.rpc(functionName, params);
    if (error) throw error;
    return { rows: Array.isArray(data) ? data : [data] };
  }

  // Connection check
  async checkConnection() {
    try {
      // Simple test query to verify connection
      await this.client.from('organizations').select('id').limit(1);
      return true;
    } catch (error) {
      console.error('Supabase HTTP connection check failed:', error);
      return false;
    }
  }

  // Begin/commit/rollback - not applicable for REST API
  async begin() {
    console.warn('Transaction begin() not supported in HTTP adapter');
    return { query: this.query.bind(this), rollback: () => {}, commit: () => {} };
  }
}

// Create singleton instance
let httpAdapter: SupabaseHTTPAdapter | null = null;

export function getHTTPAdapter() {
  if (!httpAdapter) {
    httpAdapter = new SupabaseHTTPAdapter();
  }
  return httpAdapter;
}