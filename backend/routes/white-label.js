/**
 * White-Label Routes
 * Phase 7: White-Label Features & Customization
 */

const express = require('express');
const router = express.Router();
const whiteLabelService = require('../services/white-label');
const { authenticate, requireRole, requireSuperAdmin } = require('../middleware/auth-saas');

// Public endpoint - no auth required
/**
 * @route   GET /api/white-label/login/:slug
 * @desc    Get white-label config for login page
 * @access  Public
 */
router.get('/login/:slug', async (req, res) => {
    try {
        const { slug } = req.params;
        
        const config = await whiteLabelService.getLoginConfig(slug);
        
        if (!config) {
            return res.status(404).json({ error: 'Organization not found' });
        }

        res.json(config);
    } catch (error) {
        console.error('Get login config error:', error);
        res.status(500).json({ error: 'Failed to fetch login config' });
    }
});

// Protected routes
router.use(authenticate);

/**
 * @route   GET /api/white-label/config
 * @desc    Get current organization white-label config
 * @access  Organization members
 */
router.get('/config', async (req, res) => {
    try {
        const { organization } = req;
        
        const config = await whiteLabelService.getConfig(organization.id);
        
        if (!config) {
            return res.status(404).json({ error: 'Config not found' });
        }

        res.json(config);
    } catch (error) {
        console.error('Get white-label config error:', error);
        res.status(500).json({ error: 'Failed to fetch config' });
    }
});

/**
 * @route   PUT /api/white-label/config
 * @desc    Update white-label configuration
 * @access  Organization owner/admin
 */
router.put('/config', requireRole(['owner', 'admin']), async (req, res) => {
    try {
        const { organization } = req;
        const updates = req.body;

        // Validate custom domain if provided
        if (updates.custom_domain) {
            const validation = await whiteLabelService.validateCustomDomain(
                updates.custom_domain,
                organization.id
            );
            
            if (!validation.valid) {
                return res.status(400).json({ error: validation.error });
            }
        }

        const config = await whiteLabelService.updateConfig(organization.id, updates);

        res.json({
            message: 'Configuration updated successfully',
            config
        });
    } catch (error) {
        console.error('Update white-label config error:', error);
        res.status(500).json({ error: 'Failed to update config' });
    }
});

/**
 * @route   GET /api/white-label/css
 * @desc    Get custom CSS for organization
 * @access  Organization members
 */
router.get('/css', async (req, res) => {
    try {
        const { organization } = req;
        
        const css = await whiteLabelService.generateCustomCSS(organization.id);
        
        if (!css) {
            return res.status(404).json({ error: 'CSS not found' });
        }

        res.setHeader('Content-Type', 'text/css');
        res.send(css);
    } catch (error) {
        console.error('Get custom CSS error:', error);
        res.status(500).json({ error: 'Failed to generate CSS' });
    }
});

/**
 * @route   POST /api/white-label/validate-domain
 * @desc    Validate custom domain availability
 * @access  Organization owner/admin
 */
router.post('/validate-domain', requireRole(['owner', 'admin']), async (req, res) => {
    try {
        const { organization } = req;
        const { domain } = req.body;

        if (!domain) {
            return res.status(400).json({ error: 'Domain is required' });
        }

        const result = await whiteLabelService.validateCustomDomain(domain, organization.id);

        res.json(result);
    } catch (error) {
        console.error('Validate domain error:', error);
        res.status(500).json({ error: 'Failed to validate domain' });
    }
});

// Platform admin routes
router.use(requireSuperAdmin);

/**
 * @route   GET /api/white-label/platform-stats
 * @desc    Get white-label usage statistics
 * @access  Super Admin
 */
router.get('/platform-stats', async (req, res) => {
    try {
        const stats = await whiteLabelService.getPlatformWhiteLabelStats();
        
        if (!stats) {
            return res.status(500).json({ error: 'Failed to fetch stats' });
        }

        res.json(stats);
    } catch (error) {
        console.error('Get platform stats error:', error);
        res.status(500).json({ error: 'Failed to fetch stats' });
    }
});

module.exports = router;
