const express = require('express');
const db = require('../config/database');
const { authenticate, requireAdminOrChair } = require('../middleware/auth');

const router = express.Router();

router.use(authenticate);

// GET /api/meetings - Get all meetings
router.get('/', async (req, res) => {
    try {
        const { status, type, from, to } = req.query;

        let sql = `
            SELECT m.*, 
                   c.name as committee_name,
                   creator.first_name || ' ' || creator.last_name as created_by_name,
                   (SELECT COUNT(*) FROM meeting_attendees WHERE meeting_id = m.id AND rsvp_status = 'attending') as attendee_count
            FROM meetings m
            LEFT JOIN committees c ON m.committee_id = c.id
            LEFT JOIN users creator ON m.created_by = creator.id
            WHERE 1=1
        `;
        const params = [];

        if (status) {
            sql += ' AND m.status = ?';
            params.push(status);
        }

        if (type) {
            sql += ' AND m.meeting_type = ?';
            params.push(type);
        }

        if (from) {
            sql += ' AND m.meeting_date >= ?';
            params.push(from);
        }

        if (to) {
            sql += ' AND m.meeting_date <= ?';
            params.push(to);
        }

        sql += ' ORDER BY m.meeting_date DESC';

        const meetings = await db.all(sql, params);
        res.json({ meetings });
    } catch (error) {
        console.error('Get meetings error:', error);
        res.status(500).json({ error: 'Failed to fetch meetings.' });
    }
});

// GET /api/meetings/:id - Get single meeting
router.get('/:id', async (req, res) => {
    try {
        const meeting = await db.get(
            `SELECT m.*, 
                    c.name as committee_name,
                    creator.first_name || ' ' || creator.last_name as created_by_name
             FROM meetings m
             LEFT JOIN committees c ON m.committee_id = c.id
             LEFT JOIN users creator ON m.created_by = creator.id
             WHERE m.id = ?`,
            [req.params.id]
        );

        if (!meeting) {
            return res.status(404).json({ error: 'Meeting not found.' });
        }

        // Get attendees
        const attendees = await db.all(
            `SELECT ma.*, u.first_name, u.last_name, u.email, u.avatar
             FROM meeting_attendees ma
             JOIN users u ON ma.user_id = u.id
             WHERE ma.meeting_id = ?`,
            [req.params.id]
        );

        res.json({ meeting: { ...meeting, attendees } });
    } catch (error) {
        console.error('Get meeting error:', error);
        res.status(500).json({ error: 'Failed to fetch meeting.' });
    }
});

// POST /api/meetings - Create meeting
router.post('/', requireAdminOrChair, async (req, res) => {
    try {
        const {
            title,
            meetingType,
            committeeId,
            meetingDate,
            durationMinutes = 120,
            location,
            zoomLink,
            agenda
        } = req.body;

        if (!title || !meetingType || !meetingDate) {
            return res.status(400).json({ error: 'Title, meeting type, and date are required.' });
        }

        const result = await db.run(
            `INSERT INTO meetings (title, meeting_type, committee_id, meeting_date, duration_minutes, location, zoom_link, agenda, created_by)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [title, meetingType, committeeId, meetingDate, durationMinutes, location, zoomLink, agenda, req.user.id]
        );

        // Add attendees for committee meetings
        if (committeeId) {
            const members = await db.all(
                'SELECT user_id FROM committee_members WHERE committee_id = ?',
                [committeeId]
            );
            
            for (const member of members) {
                await db.run(
                    'INSERT INTO meeting_attendees (meeting_id, user_id) VALUES (?, ?)',
                    [result.id, member.user_id]
                );
            }
        }

        const meeting = await db.get('SELECT * FROM meetings WHERE id = ?', [result.id]);
        res.status(201).json({ message: 'Meeting created successfully', meeting });
    } catch (error) {
        console.error('Create meeting error:', error);
        res.status(500).json({ error: 'Failed to create meeting.' });
    }
});

// PUT /api/meetings/:id - Update meeting
router.put('/:id', requireAdminOrChair, async (req, res) => {
    try {
        const {
            title,
            meetingDate,
            durationMinutes,
            location,
            zoomLink,
            agenda,
            minutes,
            status
        } = req.body;

        await db.run(
            `UPDATE meetings 
             SET title = ?, meeting_date = ?, duration_minutes = ?, location = ?, zoom_link = ?, agenda = ?, minutes = ?, status = ?
             WHERE id = ?`,
            [title, meetingDate, durationMinutes, location, zoomLink, agenda, minutes, status, req.params.id]
        );

        const meeting = await db.get('SELECT * FROM meetings WHERE id = ?', [req.params.id]);
        res.json({ message: 'Meeting updated successfully', meeting });
    } catch (error) {
        console.error('Update meeting error:', error);
        res.status(500).json({ error: 'Failed to update meeting.' });
    }
});

// POST /api/meetings/:id/attendees - Add attendee
router.post('/:id/attendees', requireAdminOrChair, async (req, res) => {
    try {
        const { userId } = req.body;

        await db.run(
            'INSERT OR IGNORE INTO meeting_attendees (meeting_id, user_id) VALUES (?, ?)',
            [req.params.id, userId]
        );

        res.json({ message: 'Attendee added successfully.' });
    } catch (error) {
        console.error('Add attendee error:', error);
        res.status(500).json({ error: 'Failed to add attendee.' });
    }
});

// PUT /api/meetings/:id/rsvp - RSVP to meeting
router.put('/:id/rsvp', async (req, res) => {
    try {
        const { status } = req.body; // attending, declined, tentative

        if (!['attending', 'declined', 'tentative'].includes(status)) {
            return res.status(400).json({ error: 'Invalid RSVP status.' });
        }

        await db.run(
            'UPDATE meeting_attendees SET rsvp_status = ? WHERE meeting_id = ? AND user_id = ?',
            [status, req.params.id, req.user.id]
        );

        res.json({ message: 'RSVP updated successfully.' });
    } catch (error) {
        console.error('RSVP error:', error);
        res.status(500).json({ error: 'Failed to update RSVP.' });
    }
});

// DELETE /api/meetings/:id - Cancel/delete meeting
router.delete('/:id', requireAdminOrChair, async (req, res) => {
    try {
        await db.run('DELETE FROM meetings WHERE id = ?', [req.params.id]);
        res.json({ message: 'Meeting deleted successfully.' });
    } catch (error) {
        console.error('Delete meeting error:', error);
        res.status(500).json({ error: 'Failed to delete meeting.' });
    }
});

module.exports = router;
