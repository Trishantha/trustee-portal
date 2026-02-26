const express = require('express');
const db = require('../config/database');
const { authenticate, requireRole } = require('../middleware/auth-saas');
const { requireTenant } = require('../middleware/tenant');

const router = express.Router();

router.use(authenticate);
router.use(requireTenant);

// GET /api/committees - Get all committees for organization
router.get('/', async (req, res) => {
    try {
        const committees = await db.all(
            `SELECT c.*, 
                    chair.first_name || ' ' || chair.last_name as chair_name,
                    secretary.first_name || ' ' || secretary.last_name as secretary_name,
                    (SELECT COUNT(*) FROM committee_members WHERE committee_id = c.id) as member_count,
                    (SELECT COUNT(*) FROM meetings WHERE committee_id = c.id AND status = 'scheduled') as upcoming_meetings
             FROM committees c
             LEFT JOIN organization_members chair_om ON c.chair_id = chair_om.id
             LEFT JOIN users chair ON chair_om.user_id = chair.id
             LEFT JOIN organization_members sec_om ON c.secretary_id = sec_om.id
             LEFT JOIN users secretary ON sec_om.user_id = secretary.id
             WHERE c.organization_id = ? AND c.is_active = 1
             ORDER BY c.name`,
            [req.organizationId]
        );
        res.json({ committees });
    } catch (error) {
        console.error('Get committees error:', error);
        res.status(500).json({ error: 'Failed to fetch committees.' });
    }
});

// GET /api/committees/:id - Get single committee
router.get('/:id', async (req, res) => {
    try {
        const committee = await db.get(
            `SELECT c.*, 
                    chair.first_name || ' ' || chair.last_name as chair_name,
                    secretary.first_name || ' ' || secretary.last_name as secretary_name
             FROM committees c
             LEFT JOIN organization_members chair_om ON c.chair_id = chair_om.id
             LEFT JOIN users chair ON chair_om.user_id = chair.id
             LEFT JOIN organization_members sec_om ON c.secretary_id = sec_om.id
             LEFT JOIN users secretary ON sec_om.user_id = secretary.id
             WHERE c.id = ? AND c.organization_id = ?`,
            [req.params.id, req.organizationId]
        );

        if (!committee) {
            return res.status(404).json({ error: 'Committee not found.' });
        }

        // Get members
        const members = await db.all(
            `SELECT u.id, u.first_name, u.last_name, u.email, u.avatar, om.department,
                    cm.role_in_committee, cm.joined_at
             FROM committee_members cm
             JOIN organization_members om ON cm.member_id = om.id
             JOIN users u ON om.user_id = u.id
             WHERE cm.committee_id = ?`,
            [req.params.id]
        );

        // Get recent meetings
        const meetings = await db.all(
            `SELECT m.*, 
                    (SELECT COUNT(*) FROM meeting_attendees WHERE meeting_id = m.id AND rsvp_status = 'attending') as attendee_count
             FROM meetings m
             WHERE m.committee_id = ? AND m.organization_id = ?
             ORDER BY m.meeting_date DESC
             LIMIT 10`,
            [req.params.id, req.organizationId]
        );

        res.json({ committee: { ...committee, members, meetings } });
    } catch (error) {
        console.error('Get committee error:', error);
        res.status(500).json({ error: 'Failed to fetch committee.' });
    }
});

// POST /api/committees - Create committee
router.post('/', requireRole('owner', 'admin', 'chair'), async (req, res) => {
    try {
        const { name, description, color_theme = 'primary' } = req.body;

        if (!name) {
            return res.status(400).json({ error: 'Committee name is required.' });
        }

        const result = await db.run(
            `INSERT INTO committees (organization_id, name, description, color_theme)
             VALUES (?, ?, ?, ?)`,
            [req.organizationId, name, description, color_theme]
        );

        const committee = await db.get('SELECT * FROM committees WHERE id = ?', [result.id]);
        res.status(201).json({ message: 'Committee created successfully', committee });
    } catch (error) {
        console.error('Create committee error:', error);
        res.status(500).json({ error: 'Failed to create committee.' });
    }
});

// PUT /api/committees/:id - Update committee
router.put('/:id', requireRole('owner', 'admin', 'chair'), async (req, res) => {
    try {
        const { name, description, chair_id, secretary_id, color_theme } = req.body;

        // Verify committee belongs to organization
        const existing = await db.get(
            'SELECT id FROM committees WHERE id = ? AND organization_id = ?',
            [req.params.id, req.organizationId]
        );
        
        if (!existing) {
            return res.status(404).json({ error: 'Committee not found.' });
        }

        await db.run(
            `UPDATE committees 
             SET name = ?, description = ?, chair_id = ?, secretary_id = ?, color_theme = ?, updated_at = CURRENT_TIMESTAMP
             WHERE id = ? AND organization_id = ?`,
            [name, description, chair_id, secretary_id, color_theme, req.params.id, req.organizationId]
        );

        const committee = await db.get('SELECT * FROM committees WHERE id = ?', [req.params.id]);
        res.json({ message: 'Committee updated successfully', committee });
    } catch (error) {
        console.error('Update committee error:', error);
        res.status(500).json({ error: 'Failed to update committee.' });
    }
});

// POST /api/committees/:id/members - Add member to committee
router.post('/:id/members', requireRole('owner', 'admin', 'chair'), async (req, res) => {
    try {
        const { member_id, role_in_committee = 'member' } = req.body;

        // Verify committee belongs to organization
        const committee = await db.get(
            'SELECT id FROM committees WHERE id = ? AND organization_id = ?',
            [req.params.id, req.organizationId]
        );
        
        if (!committee) {
            return res.status(404).json({ error: 'Committee not found.' });
        }

        await db.run(
            `INSERT OR IGNORE INTO committee_members (committee_id, member_id, role_in_committee)
             VALUES (?, ?, ?)`,
            [req.params.id, member_id, role_in_committee]
        );

        res.json({ message: 'Member added successfully.' });
    } catch (error) {
        console.error('Add member error:', error);
        res.status(500).json({ error: 'Failed to add member.' });
    }
});

// DELETE /api/committees/:id/members/:memberId - Remove member
router.delete('/:id/members/:memberId', requireRole('owner', 'admin', 'chair'), async (req, res) => {
    try {
        await db.run(
            'DELETE FROM committee_members WHERE committee_id = ? AND member_id = ?',
            [req.params.id, req.params.memberId]
        );
        res.json({ message: 'Member removed successfully.' });
    } catch (error) {
        console.error('Remove member error:', error);
        res.status(500).json({ error: 'Failed to remove member.' });
    }
});

// DELETE /api/committees/:id - Delete committee
router.delete('/:id', requireRole('owner', 'admin'), async (req, res) => {
    try {
        const result = await db.run(
            'UPDATE committees SET is_active = 0 WHERE id = ? AND organization_id = ?',
            [req.params.id, req.organizationId]
        );
        
        if (result.changes === 0) {
            return res.status(404).json({ error: 'Committee not found.' });
        }
        
        res.json({ message: 'Committee deleted successfully.' });
    } catch (error) {
        console.error('Delete committee error:', error);
        res.status(500).json({ error: 'Failed to delete committee.' });
    }
});

module.exports = router;
