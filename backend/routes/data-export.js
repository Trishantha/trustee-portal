/**
 * Data Export Routes
 * Phase 4: GDPR Compliance - Data Export & Deletion
 */

const express = require('express');
const router = express.Router();
const dataExportService = require('../services/data-export');
const { authenticate, requireRole, requireSuperAdmin } = require('../middleware/auth-saas');
const path = require('path');
const fs = require('fs').promises;

router.use(authenticate);

/**
 * @route   GET /api/export/organization
 * @desc    Export all organization data (GDPR Right to Data Portability)
 * @access  Organization owner/admin
 */
router.get('/organization', requireRole(['owner', 'admin']), async (req, res) => {
    try {
        const { organization } = req;
        const { format = 'json' } = req.query;

        // Generate export
        const exportInfo = await dataExportService.generateExportFile(organization.id, format);

        // Send file
        res.setHeader('Content-Type', exportInfo.contentType);
        res.setHeader('Content-Disposition', `attachment; filename="${exportInfo.filename}"`);
        
        const fileContent = await fs.readFile(exportInfo.filePath);
        res.send(fileContent);

        // Clean up file after sending (optional)
        // await fs.unlink(exportInfo.filePath);
    } catch (error) {
        console.error('Export organization error:', error);
        res.status(500).json({ error: 'Failed to export organization data' });
    }
});

/**
 * @route   GET /api/export/organization/json
 * @desc    Get organization data as JSON (for preview/download)
 * @access  Organization owner/admin
 */
router.get('/organization/json', requireRole(['owner', 'admin']), async (req, res) => {
    try {
        const { organization } = req;
        
        const data = await dataExportService.exportOrganizationData(organization.id);
        
        res.json({
            success: true,
            exported_at: new Date().toISOString(),
            data
        });
    } catch (error) {
        console.error('Export organization JSON error:', error);
        res.status(500).json({ error: 'Failed to export organization data' });
    }
});

/**
 * @route   GET /api/export/user
 * @desc    Export current user data (GDPR Right to Access)
 * @access  Authenticated user
 */
router.get('/user', async (req, res) => {
    try {
        const userId = req.user.id;
        
        const data = await dataExportService.exportUserData(userId);
        
        res.json({
            success: true,
            exported_at: new Date().toISOString(),
            data
        });
    } catch (error) {
        console.error('Export user error:', error);
        res.status(500).json({ error: 'Failed to export user data' });
    }
});

/**
 * @route   DELETE /api/export/organization
 * @desc    Delete all organization data (GDPR Right to Erasure)
 * @access  Organization owner only
 */
router.delete('/organization', requireRole(['owner']), async (req, res) => {
    try {
        const { organization } = req;
        const { confirm_delete } = req.body;

        if (!confirm_delete) {
            return res.status(400).json({
                error: 'Confirmation required',
                message: 'Please provide confirm_delete: true to permanently delete all organization data'
            });
        }

        // First export data for backup
        const backupData = await dataExportService.exportOrganizationData(organization.id);
        
        // Delete all data
        const result = await dataExportService.deleteOrganizationData(organization.id);

        res.json({
            success: true,
            message: 'All organization data has been permanently deleted',
            organization_id: organization.id,
            backup_exported: true,
            deleted_at: result.deleted_at
        });
    } catch (error) {
        console.error('Delete organization data error:', error);
        res.status(500).json({ error: 'Failed to delete organization data' });
    }
});

/**
 * @route   POST /api/export/user/anonymize
 * @desc    Anonymize user data (Alternative to deletion)
 * @access  Authenticated user
 */
router.post('/user/anonymize', async (req, res) => {
    try {
        const userId = req.user.id;
        const { confirm_anonymize } = req.body;

        if (!confirm_anonymize) {
            return res.status(400).json({
                error: 'Confirmation required',
                message: 'Please provide confirm_anonymize: true to anonymize your data'
            });
        }

        const result = await dataExportService.anonymizeUserData(userId);

        res.json({
            success: true,
            message: 'Your data has been anonymized',
            user_id: userId,
            anonymized_at: result.anonymized_at
        });
    } catch (error) {
        console.error('Anonymize user error:', error);
        res.status(500).json({ error: 'Failed to anonymize user data' });
    }
});

/**
 * @route   GET /api/export/platform
 * @desc    Export all data from platform (Super Admin only)
 * @access  Super Admin
 */
router.get('/platform', requireSuperAdmin, async (req, res) => {
    try {
        const db = require('../config/database');
        
        // Get all organizations
        const organizations = await db.all('SELECT id, name, slug FROM organizations');
        
        const exportData = {
            export_metadata: {
                type: 'platform_export',
                exported_at: new Date().toISOString(),
                exported_by: req.user.email,
                version: '2.0.0'
            },
            organizations: []
        };

        // Export each organization
        for (const org of organizations) {
            const orgData = await dataExportService.exportOrganizationData(org.id);
            exportData.organizations.push(orgData);
        }

        res.json(exportData);
    } catch (error) {
        console.error('Platform export error:', error);
        res.status(500).json({ error: 'Failed to export platform data' });
    }
});

module.exports = router;
