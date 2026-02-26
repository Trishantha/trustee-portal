/**
 * Supabase Database Module
 * PostgreSQL cloud database via Supabase
 */

const { supabaseAdmin } = require('../config/supabase');

// Supabase database interface
const db = {
    type: 'supabase',
    client: supabaseAdmin,
    
    // Parse SQL SELECT and convert to Supabase query
    async all(sql, params = []) {
        // Check if this is a JOIN query
        if (sql.includes('JOIN')) {
            return await this.handleJoinQuery(sql, params);
        }
        
        // Normalize SQL (remove newlines, extra spaces)
        const normalizedSQL = sql.replace(/\s+/g, ' ').trim();
        
        // Try to parse and use table API for SELECT
        const selectMatch = normalizedSQL.match(/SELECT\s+(.+?)\s+FROM\s+(\w+)/i);
        
        if (selectMatch) {
            const table = selectMatch[2];
            const columnsStr = selectMatch[1].trim();
            
            // Build select fields
            let selectFields = columnsStr === '*' ? '*' : columnsStr;
            
            // Start building query
            let query = supabaseAdmin.from(table).select(selectFields);
            
            // Parse WHERE clause - handle both ? params and boolean values
            const whereMatch = normalizedSQL.match(/WHERE\s+(.+?)(?:ORDER\s+BY|LIMIT|GROUP\s+BY|JOIN|$)/i);
            
            if (whereMatch) {
                const whereClause = whereMatch[1].trim();
                const conditions = whereClause.split(/\s+AND\s+/i);
                let paramIndex = 0;
                
                for (const cond of conditions) {
                    const trimmedCond = cond.trim();
                    
                    // Handle: column = ?
                    const eqMatch = trimmedCond.match(/^(\w+)\s*=\s*\?$/);
                    if (eqMatch && paramIndex < params.length) {
                        query = query.eq(eqMatch[1], params[paramIndex]);
                        paramIndex++;
                        continue;
                    }
                    
                    // Handle: column = TRUE/FALSE
                    const boolMatch = trimmedCond.match(/^(\w+)\s*=\s*(TRUE|FALSE)$/i);
                    if (boolMatch) {
                        query = query.eq(boolMatch[1], boolMatch[2].toUpperCase() === 'TRUE');
                        continue;
                    }
                    
                    // Handle: column IS NULL
                    const nullMatch = trimmedCond.match(/^(\w+)\s+IS\s+NULL$/i);
                    if (nullMatch) {
                        query = query.is(nullMatch[1], null);
                        continue;
                    }
                    
                    // Handle: column IS NOT NULL
                    const notNullMatch = trimmedCond.match(/^(\w+)\s+IS\s+NOT\s+NULL$/i);
                    if (notNullMatch) {
                        query = query.not(notNullMatch[1], 'is', null);
                        continue;
                    }
                    
                    // Handle: column LIKE ?
                    const likeMatch = trimmedCond.match(/^(\w+)\s+LIKE\s*\?$/i);
                    if (likeMatch && paramIndex < params.length) {
                        query = query.like(likeMatch[1], params[paramIndex]);
                        paramIndex++;
                        continue;
                    }
                }
            }
            
            // Parse ORDER BY
            const orderMatch = normalizedSQL.match(/ORDER\s+BY\s+(\w+)(?:\s+(ASC|DESC))?/i);
            if (orderMatch) {
                const ascending = !orderMatch[2] || orderMatch[2].toUpperCase() === 'ASC';
                query = query.order(orderMatch[1], { ascending });
            }
            
            // Parse LIMIT
            const limitMatch = normalizedSQL.match(/LIMIT\s+(\d+)/i);
            if (limitMatch) {
                query = query.limit(parseInt(limitMatch[1]));
            }
            
            // Parse OFFSET
            const offsetMatch = normalizedSQL.match(/OFFSET\s+(\d+)/i);
            if (offsetMatch) {
                const limit = parseInt(limitMatch?.[1] || 10);
                const offset = parseInt(offsetMatch[1]);
                query = query.range(offset, offset + limit - 1);
            }
            
            const { data, error } = await query;
            if (error) throw error;
            return data || [];
        }
        
        // If we can't parse the SQL, throw an error with guidance
        throw new Error(
            'Complex SQL queries are not supported. ' +
            'Please use the table API directly or simplify the query. ' +
            'Query: ' + sql.substring(0, 100) + '...'
        );
    },
    
    // Get single row
    async get(sql, params = []) {
        const rows = await this.all(sql, params);
        return rows[0] || null;
    },
    
    // Run SQL (INSERT, UPDATE, DELETE)
    async run(sql, params = []) {
        const normalizedSQL = sql.replace(/\s+/g, ' ').trim();
        
        // Try to parse INSERT
        const insertMatch = normalizedSQL.match(/INSERT\s+INTO\s+(\w+)\s*\(([^)]+)\)\s*VALUES\s*\(([^)]+)\)/i);
        if (insertMatch) {
            const table = insertMatch[1];
            const columns = insertMatch[2].split(',').map(c => c.trim());
            const values = insertMatch[3].split(',').map(v => v.trim());
            
            const data = {};
            let paramIndex = 0;
            for (let i = 0; i < columns.length; i++) {
                if (values[i] === '?' && paramIndex < params.length) {
                    data[columns[i]] = params[paramIndex];
                    paramIndex++;
                } else if (values[i].toUpperCase() === 'CURRENT_TIMESTAMP' || values[i].toUpperCase() === 'NOW()') {
                    data[columns[i]] = new Date().toISOString();
                } else if (values[i].toUpperCase() === 'TRUE' || values[i] === '1') {
                    data[columns[i]] = true;
                } else if (values[i].toUpperCase() === 'FALSE' || values[i] === '0') {
                    data[columns[i]] = false;
                }
            }
            
            const { data: result, error } = await supabaseAdmin
                .from(table)
                .insert(data)
                .select()
                .single();
            
            if (error) throw error;
            return { id: result.id, changes: 1, lastID: result.id };
        }
        
        // Try to parse UPDATE
        const updateMatch = normalizedSQL.match(/UPDATE\s+(\w+)\s+SET\s+(.+?)\s+WHERE\s+(.+)$/i);
        if (updateMatch) {
            const table = updateMatch[1];
            const setClause = updateMatch[2];
            const whereClause = updateMatch[3];
            
            // Parse SET pairs
            const setPairs = setClause.split(',').map(p => p.trim());
            const data = {};
            let paramIndex = 0;
            
            for (const pair of setPairs) {
                const eqMatch = pair.match(/^(\w+)\s*=\s*\?$/);
                if (eqMatch && paramIndex < params.length) {
                    data[eqMatch[1]] = params[paramIndex];
                    paramIndex++;
                } else {
                    // Handle CURRENT_TIMESTAMP and other literals
                    const literalMatch = pair.match(/^(\w+)\s*=\s*(CURRENT_TIMESTAMP|NOW\(\)|true|false)$/i);
                    if (literalMatch) {
                        if (literalMatch[2].toUpperCase() === 'CURRENT_TIMESTAMP' || literalMatch[2].toUpperCase() === 'NOW()') {
                            data[literalMatch[1]] = new Date().toISOString();
                        } else {
                            data[literalMatch[1]] = literalMatch[2].toLowerCase() === 'true';
                        }
                    }
                }
            }
            
            // Parse WHERE
            let query = supabaseAdmin.from(table).update(data);
            const whereEqMatch = whereClause.match(/^(\w+)\s*=\s*\?$/);
            if (whereEqMatch && paramIndex < params.length) {
                query = query.eq(whereEqMatch[1], params[paramIndex]);
            }
            
            const { error } = await query;
            if (error) throw error;
            return { changes: 1 };
        }
        
        // Try to parse DELETE
        const deleteMatch = normalizedSQL.match(/DELETE\s+FROM\s+(\w+)\s+WHERE\s+(.+)$/i);
        if (deleteMatch) {
            const table = deleteMatch[1];
            const whereClause = deleteMatch[2];
            
            let query = supabaseAdmin.from(table).delete();
            const whereEqMatch = whereClause.match(/^(\w+)\s*=\s*\?$/);
            if (whereEqMatch && params.length > 0) {
                query = query.eq(whereEqMatch[1], params[0]);
            }
            
            const { error } = await query;
            if (error) throw error;
            return { changes: 1 };
        }
        
        throw new Error(
            'Complex SQL statements are not supported. ' +
            'Query: ' + sql.substring(0, 100) + '...'
        );
    },
    
    // Handle JOIN queries specially
    async handleJoinQuery(sql, params = []) {
        const normalizedSQL = sql.replace(/\s+/g, ' ').trim();
        
        // Parse the query components
        const fromMatch = normalizedSQL.match(/FROM\s+(\w+)\s+(\w+)\s*/i);
        const joinMatch = normalizedSQL.match(/JOIN\s+(\w+)\s+(\w+)\s+ON\s+(.+?)(?:WHERE|ORDER|LIMIT|$)/i);
        const selectMatch = normalizedSQL.match(/SELECT\s+(.+?)\s+FROM/i);
        const whereMatch = normalizedSQL.match(/WHERE\s+(.+?)(?:ORDER\s+BY|LIMIT|GROUP|$)/i);
        const orderMatch = normalizedSQL.match(/ORDER\s+BY\s+(.+?)(?:LIMIT|$)/i);
        
        if (!fromMatch || !joinMatch) {
            throw new Error('Could not parse JOIN query');
        }
        
        const primaryTable = fromMatch[1];
        const primaryAlias = fromMatch[2];
        const joinTable = joinMatch[1];
        const joinAlias = joinMatch[2];
        
        // Parse SELECT columns
        const selectFields = selectMatch ? selectMatch[1] : '*';
        const columns = selectFields.split(',').map(c => c.trim());
        
        // Build Supabase select string with foreign table reference
        const mainColumns = [];
        const foreignColumns = [];
        
        for (const col of columns) {
            // Check if column has alias prefix
            const parts = col.split('.');
            if (parts.length === 2) {
                const alias = parts[0];
                const field = parts[1];
                
                if (alias === primaryAlias) {
                    mainColumns.push(field);
                } else if (alias === joinAlias) {
                    foreignColumns.push(field);
                }
            } else {
                mainColumns.push(col);
            }
        }
        
        // Build select string
        let selectStr = mainColumns.join(', ');
        if (foreignColumns.length > 0) {
            selectStr += `, ${joinTable}!inner(${foreignColumns.join(', ')})`;
        }
        
        // Start query
        let query = supabaseAdmin.from(primaryTable).select(selectStr);
        
        // Collect filters for post-processing
        const foreignFilters = [];
        
        // Parse and apply WHERE conditions
        if (whereMatch) {
            const whereClause = whereMatch[1].trim();
            const conditions = whereClause.split(/\s+AND\s+/i);
            let paramIndex = 0;
            
            for (const cond of conditions) {
                const trimmedCond = cond.trim();
                
                // Remove table alias from column names for Supabase
                const eqMatch = trimmedCond.match(/^(?:\w+\.)?(\w+)\s*=\s*\?$/);
                if (eqMatch && paramIndex < params.length) {
                    const colName = eqMatch[1];
                    const value = params[paramIndex];
                    
                    // Apply filter based on which table the column belongs to
                    if (trimmedCond.startsWith(joinAlias + '.')) {
                        foreignFilters.push({ col: colName, value });
                    } else {
                        query = query.eq(colName, value);
                    }
                    paramIndex++;
                    continue;
                }
                
                // Handle boolean comparisons
                const boolMatch = trimmedCond.match(/^(?:\w+\.)?(\w+)\s*=\s*(TRUE|FALSE|1|0)$/i);
                if (boolMatch) {
                    const colName = boolMatch[1];
                    const value = boolMatch[2].toUpperCase() === 'TRUE' || boolMatch[2] === '1';
                    
                    if (trimmedCond.startsWith(joinAlias + '.')) {
                        foreignFilters.push({ col: colName, value });
                    } else {
                        query = query.eq(colName, value);
                    }
                }
            }
        }
        
        // Parse ORDER BY
        if (orderMatch) {
            const orderParts = orderMatch[1].trim().split(/\s+/);
            const colName = orderParts[0].replace(/^\w+\./, '');
            const ascending = !orderParts[1] || orderParts[1].toUpperCase() !== 'DESC';
            query = query.order(colName, { ascending });
        }
        
        let { data, error } = await query;
        if (error) throw error;
        
        // Transform the nested data to flat format for compatibility
        let flatData = (data || []).map(row => {
            const flat = { ...row };
            // Flatten foreign table data
            if (flat[joinTable]) {
                Object.assign(flat, flat[joinTable]);
                delete flat[joinTable];
            }
            return flat;
        });
        
        // Apply foreign table filters post-query
        if (foreignFilters.length > 0) {
            flatData = flatData.filter(row => {
                return foreignFilters.every(filter => row[filter.col] === filter.value);
            });
        }
        
        return flatData;
    },
    
    // Direct table operations (recommended approach)
    async query(table, options = {}) {
        let query = supabaseAdmin.from(table).select(options.select || '*');
        
        if (options.where) {
            Object.entries(options.where).forEach(([key, value]) => {
                if (Array.isArray(value)) {
                    query = query.in(key, value);
                } else if (typeof value === 'object' && value !== null) {
                    Object.entries(value).forEach(([op, val]) => {
                        switch(op) {
                            case 'gt': query = query.gt(key, val); break;
                            case 'lt': query = query.lt(key, val); break;
                            case 'gte': query = query.gte(key, val); break;
                            case 'lte': query = query.lte(key, val); break;
                            case 'neq': query = query.neq(key, val); break;
                            case 'like': query = query.like(key, `%${val}%`); break;
                            case 'ilike': query = query.ilike(key, `%${val}%`); break;
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
    
    async insert(table, data) {
        const { data: result, error } = await supabaseAdmin
            .from(table)
            .insert(data)
            .select()
            .single();
        
        if (error) throw error;
        return { id: result.id, changes: 1, lastID: result.id, ...result };
    },
    
    async update(table, data, where) {
        let query = supabaseAdmin.from(table).update(data);
        
        Object.entries(where).forEach(([key, value]) => {
            query = query.eq(key, value);
        });
        
        const { error } = await query;
        if (error) throw error;
        return { changes: 1 };
    },
    
    async delete(table, where) {
        let query = supabaseAdmin.from(table).delete();
        
        Object.entries(where).forEach(([key, value]) => {
            query = query.eq(key, value);
        });
        
        const { error } = await query;
        if (error) throw error;
        return { changes: 1 };
    },
    
    // Real-time subscriptions
    subscribe(table, callback, filter = {}) {
        let subscription = supabaseAdmin
            .channel(`${table}-changes`)
            .on('postgres_changes', 
                { event: '*', schema: 'public', table, ...filter },
                callback
            )
            .subscribe();
        
        return subscription;
    }
};

console.log('✅ Using Supabase (PostgreSQL) database');

module.exports = { db };
