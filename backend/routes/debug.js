/**
 * Debug Routes - For testing and diagnostics
 */

const express = require('express');
const router = express.Router();
const db = require('../config/database');

/**
 * @route   GET /api/debug/audit-log-check
 * @desc    Check if audit_log table exists
 * @access  Public (for debugging)
 */
router.get('/audit-log-check', async (req, res) => {
    try {
        // Try to query audit_log
        let activities = [];
        let tableInfo = null;
        let error = null;
        
        try {
            const result = await db.all('SELECT * FROM audit_log LIMIT 5');
            activities = result;
        } catch (e) {
            error = e.message;
        }
        
        // Try to get table info
        try {
            const info = await db.all(`
                SELECT column_name, data_type 
                FROM information_schema.columns 
                WHERE table_name = 'audit_log'
            `);
            tableInfo = info;
        } catch (e) {
            tableInfo = { error: e.message };
        }
        
        res.json({
            activities_count: activities.length,
            activities: activities,
            table_info: tableInfo,
            query_error: error
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * @route   POST /api/debug/seed-audit
 * @desc    Seed test audit log entries
 * @access  Public (for debugging)
 */
router.post('/seed-audit', async (req, res) => {
    try {
        // First, try to drop the table_name column if it exists
        try {
            await db.run('ALTER TABLE audit_log DROP COLUMN IF EXISTS table_name');
        } catch (e) {}
        
        // Insert test activities using SQL directly
        const inserted = [];
        
        try {
            await db.run(`
                INSERT INTO audit_log (action, entity_type, details, created_at)
                VALUES (?, ?, ?, NOW())
            `, ['system_test', 'system', JSON.stringify({ message: 'Test activity 1' })]);
            inserted.push({ action: 'system_test', status: 'success' });
        } catch (e) {
            inserted.push({ action: 'system_test', error: e.message });
        }
        
        try {
            await db.run(`
                INSERT INTO audit_log (action, entity_type, entity_id, new_values, created_at)
                VALUES (?, ?, ?, ?, NOW())
            `, ['plan_updated', 'subscription_plan', 1, JSON.stringify({ name: 'Test Plan', price: 99 })]);
            inserted.push({ action: 'plan_updated', status: 'success' });
        } catch (e) {
            inserted.push({ action: 'plan_updated', error: e.message });
        }
        
        try {
            await db.run(`
                INSERT INTO audit_log (action, entity_type, entity_id, new_values, created_at)
                VALUES (?, ?, ?, ?, NOW())
            `, ['organization_suspended', 'organization', 1, JSON.stringify({ reason: 'Test suspension' })]);
            inserted.push({ action: 'organization_suspended', status: 'success' });
        } catch (e) {
            inserted.push({ action: 'organization_suspended', error: e.message });
        }
        
        res.json({
            message: 'Test audit entries created',
            inserted: inserted
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
