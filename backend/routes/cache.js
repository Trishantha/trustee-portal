/**
 * Cache Management Routes
 * Clear various caches for troubleshooting
 */

const express = require('express');
const router = express.Router();
const { authenticate, requireSuperAdmin } = require('../middleware/auth-saas');
const { supabase, supabaseAdmin } = require('../config/supabase');

/**
 * @route   POST /api/cache/clear
 * @desc    Clear various caches
 * @access  Super Admin only
 */
router.post('/clear', authenticate, requireSuperAdmin, async (req, res) => {
    try {
        const { type } = req.body;
        const results = {
            success: true,
            cleared: [],
            errors: []
        };

        // Clear based on type
        switch(type) {
            case 'supabase':
            case 'all':
                // Note: Supabase client doesn't have a direct cache clear
                // but we can verify connection is working
                try {
                    const { data, error } = await supabaseAdmin
                        .from('users')
                        .select('count', { count: 'exact', head: true });
                    
                    if (error) throw error;
                    results.cleared.push('Supabase connection verified');
                } catch (err) {
                    results.errors.push('Supabase: ' + err.message);
                }
                break;

            case 'memory':
            case 'all':
                // Force garbage collection if available (Node.js flag required)
                if (global.gc) {
                    global.gc();
                    results.cleared.push('Memory garbage collection triggered');
                } else {
                    results.cleared.push('Memory: GC not available (use --expose-gc flag)');
                }
                break;

            case 'modules':
            case 'all':
                // Clear require cache (dangerous, use with caution)
                const clearedModules = [];
                Object.keys(require.cache).forEach(key => {
                    if (key.includes('trustee-portal') && !key.includes('node_modules')) {
                        delete require.cache[key];
                        clearedModules.push(key.split('/').pop());
                    }
                });
                if (clearedModules.length > 0) {
                    results.cleared.push(`Cleared ${clearedModules.length} module caches`);
                }
                break;
        }

        res.json({
            message: 'Cache clear operation completed',
            ...results,
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        console.error('Cache clear error:', error);
        res.status(500).json({
            error: 'Failed to clear cache',
            message: error.message
        });
    }
});

/**
 * @route   GET /api/cache/status
 * @desc    Get cache status
 * @access  Super Admin only
 */
router.get('/status', authenticate, requireSuperAdmin, async (req, res) => {
    try {
        const status = {
            memory: {
                used: Math.round(process.memoryUsage().heapUsed / 1024 / 1024) + ' MB',
                total: Math.round(process.memoryUsage().heapTotal / 1024 / 1024) + ' MB',
                rss: Math.round(process.memoryUsage().rss / 1024 / 1024) + ' MB'
            },
            uptime: {
                server: Math.round(process.uptime()) + ' seconds',
                node: process.uptime() + ' seconds'
            },
            modules: {
                cached: Object.keys(require.cache).length
            },
            database: {
                connected: true,
                type: 'supabase'
            },
            timestamp: new Date().toISOString()
        };

        // Test database connection
        try {
            const { error } = await supabaseAdmin
                .from('users')
                .select('count', { count: 'exact', head: true });
            
            if (error) {
                status.database.connected = false;
                status.database.error = error.message;
            }
        } catch (err) {
            status.database.connected = false;
            status.database.error = err.message;
        }

        res.json(status);

    } catch (error) {
        console.error('Cache status error:', error);
        res.status(500).json({
            error: 'Failed to get cache status',
            message: error.message
        });
    }
});

/**
 * @route   POST /api/cache/flush-supabase
 * @desc    Force reconnect to Supabase (simulates cache flush)
 * @access  Super Admin only
 */
router.post('/flush-supabase', authenticate, requireSuperAdmin, async (req, res) => {
    try {
        // Test multiple queries to "warm up" fresh connections
        const tests = await Promise.all([
            supabaseAdmin.from('users').select('id', { count: 'exact', head: true }),
            supabaseAdmin.from('organizations').select('id', { count: 'exact', head: true }),
            supabaseAdmin.from('subscription_plans').select('id', { count: 'exact', head: true })
        ]);

        const errors = tests.filter(t => t.error);
        
        if (errors.length > 0) {
            throw new Error(errors.map(e => e.error.message).join(', '));
        }

        res.json({
            message: 'Supabase connection refreshed',
            tables_verified: [
                'users',
                'organizations', 
                'subscription_plans'
            ],
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        console.error('Supabase flush error:', error);
        res.status(500).json({
            error: 'Failed to refresh Supabase connection',
            message: error.message
        });
    }
});

module.exports = router;
