const express = require('express');
const db = require('../config/database');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

router.use(authenticate);

// GET /api/dashboard - Get dashboard stats
router.get('/', async (req, res) => {
    try {
        const userId = req.user.id;
        const userRole = req.user.role;

        // Get user stats
        const userStats = await db.get(
            `SELECT 
                (SELECT COUNT(*) FROM tasks WHERE assigned_to = ? AND status IN ('pending', 'in_progress')) as pending_tasks,
                (SELECT COUNT(*) FROM tasks WHERE assigned_to = ? AND status = 'completed') as completed_tasks,
                (SELECT COUNT(*) FROM meeting_attendees ma JOIN meetings m ON ma.meeting_id = m.id WHERE ma.user_id = ? AND m.status = 'scheduled' AND ma.rsvp_status = 'attending') as upcoming_meetings,
                (SELECT COUNT(*) FROM notifications WHERE user_id = ? AND is_read = 0) as unread_notifications`,
            [userId, userId, userId, userId]
        );

        // Get upcoming meetings
        const upcomingMeetings = await db.all(
            `SELECT m.id, m.title, m.meeting_date, m.location, m.zoom_link, m.meeting_type,
                    c.name as committee_name,
                    ma.rsvp_status
             FROM meetings m
             LEFT JOIN committees c ON m.committee_id = c.id
             JOIN meeting_attendees ma ON m.id = ma.meeting_id
             WHERE ma.user_id = ? AND m.status = 'scheduled' AND m.meeting_date >= date('now')
             ORDER BY m.meeting_date ASC
             LIMIT 5`,
            [userId]
        );

        // Get pending tasks
        const pendingTasks = await db.all(
            `SELECT t.*, 
                    u.first_name || ' ' || u.last_name as assigned_by_name
             FROM tasks t
             LEFT JOIN users u ON t.assigned_by = u.id
             WHERE t.assigned_to = ? AND t.status IN ('pending', 'in_progress')
             ORDER BY t.due_date ASC
             LIMIT 5`,
            [userId]
        );

        // Get recent messages
        const recentMessages = await db.all(
            `SELECT m.*, 
                    c.title as conversation_title,
                    c.type as conversation_type,
                    u.first_name || ' ' || u.last_name as sender_name,
                    u.avatar as sender_avatar
             FROM messages m
             JOIN conversations c ON m.conversation_id = c.id
             JOIN conversation_participants cp ON c.id = cp.conversation_id
             JOIN users u ON m.sender_id = u.id
             WHERE cp.user_id = ? AND m.sender_id != ?
               AND (cp.last_read_at IS NULL OR m.sent_at > cp.last_read_at)
             ORDER BY m.sent_at DESC
             LIMIT 5`,
            [userId, userId]
        );

        // Get recent notifications
        const notifications = await db.all(
            `SELECT * FROM notifications 
             WHERE user_id = ? AND is_read = 0
             ORDER BY created_at DESC
             LIMIT 10`,
            [userId]
        );

        // Admin/Chair specific stats
        let adminStats = null;
        if (userRole === 'admin' || userRole === 'chair') {
            adminStats = await db.get(
                `SELECT 
                    (SELECT COUNT(*) FROM users WHERE is_active = 1) as total_users,
                    (SELECT COUNT(*) FROM committees) as total_committees,
                    (SELECT COUNT(*) FROM job_openings WHERE status = 'active') as active_jobs,
                    (SELECT COUNT(*) FROM applications WHERE status = 'new') as new_applications,
                    (SELECT COUNT(*) FROM meetings WHERE status = 'scheduled') as upcoming_meetings_all`
            );

            // Get recruitment pipeline
            const recruitmentPipeline = await db.get(
                `SELECT 
                    (SELECT COUNT(*) FROM applications WHERE status = 'new') as new_applications,
                    (SELECT COUNT(*) FROM applications WHERE status = 'reviewing') as reviewing,
                    (SELECT COUNT(*) FROM shortlisted_candidates WHERE status IN ('pending', 'interview_scheduled')) as shortlisted,
                    (SELECT COUNT(*) FROM selected_candidates WHERE offer_accepted = 0) as selected,
                    (SELECT COUNT(*) FROM selected_candidates WHERE offer_accepted = 1) as hired`
            );

            adminStats.recruitmentPipeline = recruitmentPipeline;
        }

        res.json({
            userStats,
            upcomingMeetings,
            pendingTasks,
            recentMessages,
            notifications,
            adminStats
        });
    } catch (error) {
        console.error('Dashboard error:', error);
        res.status(500).json({ error: 'Failed to fetch dashboard data.' });
    }
});

// GET /api/dashboard/calendar - Get calendar events
router.get('/calendar', async (req, res) => {
    try {
        const { month, year } = req.query;
        const userId = req.user.id;

        // Get meetings as calendar events
        const meetings = await db.all(
            `SELECT m.id, m.title, m.meeting_date as start, 
                    m.duration_minutes, m.location, m.meeting_type,
                    c.name as committee_name,
                    datetime(m.meeting_date, '+' || m.duration_minutes || ' minutes') as end
             FROM meetings m
             LEFT JOIN committees c ON m.committee_id = c.id
             JOIN meeting_attendees ma ON m.id = ma.meeting_id
             WHERE ma.user_id = ? AND m.status != 'cancelled'
               AND strftime('%Y-%m', m.meeting_date) = ?`,
            [userId, `${year}-${month.padStart(2, '0')}`]
        );

        // Get tasks with due dates as calendar events
        const tasks = await db.all(
            `SELECT id, title, due_date as start, priority, status,
                    'Task Due: ' || title as title
             FROM tasks
             WHERE assigned_to = ? AND due_date IS NOT NULL
               AND strftime('%Y-%m', due_date) = ?`,
            [userId, `${year}-${month.padStart(2, '0')}`]
        );

        const events = [
            ...meetings.map(m => ({ ...m, type: 'meeting' })),
            ...tasks.map(t => ({ ...t, type: 'task', allDay: true }))
        ];

        res.json({ events });
    } catch (error) {
        console.error('Calendar error:', error);
        res.status(500).json({ error: 'Failed to fetch calendar events.' });
    }
});

// GET /api/dashboard/activity - Get recent activity
router.get('/activity', async (req, res) => {
    try {
        const activities = await db.all(
            `SELECT al.*, 
                    u.first_name || ' ' || u.last_name as user_name
             FROM audit_log al
             LEFT JOIN users u ON al.user_id = u.id
             ORDER BY al.created_at DESC
             LIMIT 50`
        );

        res.json({ activities });
    } catch (error) {
        console.error('Activity error:', error);
        res.status(500).json({ error: 'Failed to fetch activity.' });
    }
});

module.exports = router;
