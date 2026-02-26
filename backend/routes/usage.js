/**
 * Usage Routes
 * Phase 3: Usage Tracking & Limits
 */

const express = require('express');
const router = express.Router();
const usageTracker = require('../services/usage-tracker');
const { authenticate, requireSuperAdmin } = require('../middleware/auth-saas');

router.use(authenticate);

/**
 * @route   GET /api/usage
 * @desc    Get current organization usage
 * @access  Organization members
 */
router.get('/', async (req, res) => {
    try {
        const { organization } = req;
        const usage = await usageTracker.getUsage(organization.id);

        if (!usage) {
            return res.status(404).json({ error: 'Usage data not found' });
        }

        res.json(usage);
    } catch (error) {
        console.error('Get usage error:', error);
        res.status(500).json({ error: 'Failed to fetch usage data' });
    }
});

/**
 * @route   GET /api/usage/history
 * @desc    Get usage history
 * @access  Organization members
 */
router.get('/history', async (req, res) => {
    try {
        const { organization } = req;
        const { days = 30 } = req.query;

        const history = await usageTracker.getUsageHistory(organization.id, parseInt(days));

        res.json({ history });
    } catch (error) {
        console.error('Get usage history error:', error);
        res.status(500).json({ error: 'Failed to fetch usage history' });
    }
});

/**
 * @route   GET /api/usage/platform
 * @desc    Get platform-wide usage stats (Super Admin only)
 * @access  Super Admin
 */
router.get('/platform', requireSuperAdmin, async (req, res) => {
    try {
        const stats = await usageTracker.getPlatformStats();

        if (!stats) {
            return res.status(500).json({ error: 'Failed to fetch platform stats' });
        }

        res.json(stats);
    } catch (error) {
        console.error('Get platform usage error:', error);
        res.status(500).json({ error: 'Failed to fetch platform usage' });
    }
});

/**
 * @route   GET /api/usage/warnings
 * @desc    Get organizations near limits (Super Admin only)
 * @access  Super Admin
 */
router.get('/warnings', requireSuperAdmin, async (req, res) => {
    try {
        const warnings = await usageTracker.sendLimitWarnings();

        res.json({ warnings });
    } catch (error) {
        console.error('Get usage warnings error:', error);
        res.status(500).json({ error: 'Failed to fetch usage warnings' });
    }
});

module.exports = router;
