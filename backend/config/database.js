/**
 * Database Configuration
 * Supabase (PostgreSQL) database for the Trustee Portal
 */

const { db } = require('../database');

// Export the Supabase database interface
module.exports = db;
