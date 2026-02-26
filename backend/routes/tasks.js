const express = require('express');
const db = require('../config/database');
const { authenticate, requireAdminOrChair } = require('../middleware/auth');

const router = express.Router();

router.use(authenticate);

// GET /api/tasks - Get all tasks
router.get('/', async (req, res) => {
    try {
        const { assignedTo, status, priority } = req.query;

        let sql = `
            SELECT t.*, 
                   assigned.first_name || ' ' || assigned.last_name as assigned_to_name,
                   assigner.first_name || ' ' || assigner.last_name as assigned_by_name
            FROM tasks t
            LEFT JOIN users assigned ON t.assigned_to = assigned.id
            LEFT JOIN users assigner ON t.assigned_by = assigner.id
            WHERE 1=1
        `;
        const params = [];

        if (assignedTo) {
            sql += ' AND t.assigned_to = ?';
            params.push(assignedTo);
        }

        if (status) {
            sql += ' AND t.status = ?';
            params.push(status);
        }

        if (priority) {
            sql += ' AND t.priority = ?';
            params.push(priority);
        }

        // Trustees can only see their own tasks
        if (req.user.role === 'trustee') {
            sql += ' AND t.assigned_to = ?';
            params.push(req.user.id);
        }

        sql += ' ORDER BY t.created_at DESC';

        const tasks = await db.all(sql, params);
        res.json({ tasks });
    } catch (error) {
        console.error('Get tasks error:', error);
        res.status(500).json({ error: 'Failed to fetch tasks.' });
    }
});

// GET /api/tasks/:id - Get single task
router.get('/:id', async (req, res) => {
    try {
        const task = await db.get(
            `SELECT t.*, 
                    assigned.first_name || ' ' || assigned.last_name as assigned_to_name,
                    assigner.first_name || ' ' || assigner.last_name as assigned_by_name
             FROM tasks t
             LEFT JOIN users assigned ON t.assigned_to = assigned.id
             LEFT JOIN users assigner ON t.assigned_by = assigner.id
             WHERE t.id = ?`,
            [req.params.id]
        );

        if (!task) {
            return res.status(404).json({ error: 'Task not found.' });
        }

        // Trustees can only view their own tasks
        if (req.user.role === 'trustee' && task.assigned_to !== req.user.id) {
            return res.status(403).json({ error: 'Access denied.' });
        }

        res.json({ task });
    } catch (error) {
        console.error('Get task error:', error);
        res.status(500).json({ error: 'Failed to fetch task.' });
    }
});

// POST /api/tasks - Create task
router.post('/', requireAdminOrChair, async (req, res) => {
    try {
        const { title, description, assignedTo, priority = 'medium', dueDate, category } = req.body;

        if (!title || !assignedTo) {
            return res.status(400).json({ error: 'Title and assigned user are required.' });
        }

        const result = await db.run(
            `INSERT INTO tasks (title, description, assigned_to, assigned_by, priority, due_date, category)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [title, description, assignedTo, req.user.id, priority, dueDate, category]
        );

        const task = await db.get('SELECT * FROM tasks WHERE id = ?', [result.id]);
        res.status(201).json({ message: 'Task created successfully', task });
    } catch (error) {
        console.error('Create task error:', error);
        res.status(500).json({ error: 'Failed to create task.' });
    }
});

// PUT /api/tasks/:id - Update task
router.put('/:id', async (req, res) => {
    try {
        const task = await db.get('SELECT * FROM tasks WHERE id = ?', [req.params.id]);
        
        if (!task) {
            return res.status(404).json({ error: 'Task not found.' });
        }

        // Trustees can only update their own tasks
        if (req.user.role === 'trustee' && task.assigned_to !== req.user.id) {
            return res.status(403).json({ error: 'Access denied.' });
        }

        const { title, description, priority, dueDate, status, category } = req.body;

        let completedAt = task.completed_at;
        if (status === 'completed' && task.status !== 'completed') {
            completedAt = new Date().toISOString();
        } else if (status !== 'completed') {
            completedAt = null;
        }

        await db.run(
            `UPDATE tasks 
             SET title = ?, description = ?, priority = ?, due_date = ?, status = ?, category = ?, completed_at = ?
             WHERE id = ?`,
            [title, description, priority, dueDate, status, category, completedAt, req.params.id]
        );

        const updatedTask = await db.get('SELECT * FROM tasks WHERE id = ?', [req.params.id]);
        res.json({ message: 'Task updated successfully', task: updatedTask });
    } catch (error) {
        console.error('Update task error:', error);
        res.status(500).json({ error: 'Failed to update task.' });
    }
});

// POST /api/tasks/:id/complete - Complete task
router.post('/:id/complete', async (req, res) => {
    try {
        const task = await db.get('SELECT * FROM tasks WHERE id = ?', [req.params.id]);
        
        if (!task) {
            return res.status(404).json({ error: 'Task not found.' });
        }

        if (req.user.role === 'trustee' && task.assigned_to !== req.user.id) {
            return res.status(403).json({ error: 'Access denied.' });
        }

        await db.run(
            `UPDATE tasks SET status = 'completed', completed_at = CURRENT_TIMESTAMP WHERE id = ?`,
            [req.params.id]
        );

        res.json({ message: 'Task marked as completed.' });
    } catch (error) {
        console.error('Complete task error:', error);
        res.status(500).json({ error: 'Failed to complete task.' });
    }
});

// DELETE /api/tasks/:id - Delete task
router.delete('/:id', requireAdminOrChair, async (req, res) => {
    try {
        await db.run('DELETE FROM tasks WHERE id = ?', [req.params.id]);
        res.json({ message: 'Task deleted successfully.' });
    } catch (error) {
        console.error('Delete task error:', error);
        res.status(500).json({ error: 'Failed to delete task.' });
    }
});

module.exports = router;
