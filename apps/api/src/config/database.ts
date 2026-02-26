/**
 * Database Configuration
 * Uses existing Supabase setup
 */

import { createClient } from '@supabase/supabase-js';
// Logger available when needed

const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_KEY || '';

// Create Supabase client
export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

// Simple database interface that wraps Supabase
export const db = {
  async query(table: string, options: any = {}) {
    let query = supabase.from(table).select(options.select || '*');
    
    if (options.where) {
      Object.entries(options.where).forEach(([key, value]: [string, any]) => {
        if (Array.isArray(value)) {
          query = query.in(key, value);
        } else if (typeof value === 'object' && value !== null) {
          Object.entries(value).forEach(([op, val]) => {
            switch(op) {
              case 'eq': query = query.eq(key, val); break;
              case 'gt': query = query.gt(key, val); break;
              case 'lt': query = query.lt(key, val); break;
              case 'gte': query = query.gte(key, val); break;
              case 'lte': query = query.lte(key, val); break;
              case 'neq': query = query.neq(key, val); break;
              case 'like': query = query.like(key, `%${val}%`); break;
            }
          });
        } else {
          query = query.eq(key, value);
        }
      });
    }
    
    if (options.order) {
      query = query.order(options.order.column, { 
        ascending: options.order.ascending !== false 
      });
    }
    
    if (options.limit) {
      query = query.limit(options.limit);
    }
    
    const { data, error } = await query;
    if (error) throw error;
    return data || [];
  },
  
  async insert(table: string, data: any) {
    const { data: result, error } = await supabase
      .from(table)
      .insert(data)
      .select()
      .single();
    
    if (error) throw error;
    return result;
  },
  
  async update(table: string, data: any, where: any) {
    let query = supabase.from(table).update(data);
    
    Object.entries(where).forEach(([key, value]) => {
      query = query.eq(key, value);
    });
    
    const { error } = await query;
    if (error) throw error;
    return { changes: 1 };
  },
  
  async delete(table: string, where: any) {
    let query = supabase.from(table).delete();
    
    Object.entries(where).forEach(([key, value]) => {
      query = query.eq(key, value);
    });
    
    const { error } = await query;
    if (error) throw error;
    return { changes: 1 };
  }
};

// Health check
export async function checkDatabaseHealth(): Promise<boolean> {
  try {
    const { error } = await supabase.from('users').select('id').limit(1);
    return !error;
  } catch {
    return false;
  }
}

export default db;
