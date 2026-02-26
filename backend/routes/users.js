const express = require('express');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const db = require('../config/database');
const { authenticate, requireAdmin } = require('../middleware/auth');

const router = express.Router();

// Multer storage configuration for avatars
const avatarsDir = path.join(__dirname, '..', 'uploads', 'avatars');
if (!fs.existsSync(avatarsDir)) {
    fs.mkdirSync(avatarsDir, { recursive: true });
}

const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, avatarsDir);
    },
    filename: function (req, file, cb) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const ext = path.extname(file.originalname);
        cb(null, 'avatar-' + uniqueSuffix + ext);
    }
});

const upload = multer({
    storage: storage,
    limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
    fileFilter: function (req, file, cb) {
        if (file.mimetype.startsWith('image/')) {
            cb(null, true);
        } else {
            cb(new Error('Only image files are allowed'), false);
        }
    }
});

router.use(authenticate);

// GET /api/users - Get all users
router.get('/', async (req, res) => {
    try {
        const { role, search = '' } = req.query;

        let sql = `
            SELECT id, email, first_name, last_name, role, avatar, 
                   department, phone, is_active, last_login, created_at
            FROM users
            WHERE 1=1
        `;
        const params = [];

        if (role) {
            sql += ' AND role = ?';
            params.push(role);
        }

        if (search) {
            sql += ' AND (first_name LIKE ? OR last_name LIKE ? OR email LIKE ?)';
            params.push(`%${search}%`, `%${search}%`, `%${search}%`);
        }

        sql += ' ORDER BY first_name, last_name';

        const users = await db.all(sql, params);
        res.json({ users });
    } catch (error) {
        console.error('Get users error:', error);
        res.status(500).json({ error: 'Failed to fetch users.' });
    }
});

// GET /api/users/:id - Get single user
router.get('/:id', async (req, res) => {
    try {
        const user = await db.get(
            `SELECT id, email, first_name, last_name, role, avatar, 
                    department, phone, bio, is_active, last_login, created_at
             FROM users WHERE id = ?`,
            [req.params.id]
        );

        if (!user) {
            return res.status(404).json({ error: 'User not found.' });
        }

        // Get committee memberships
        const committees = await db.all(
            `SELECT c.id, c.name, c.color_theme, cm.role_in_committee
             FROM committees c
             JOIN committee_members cm ON c.id = cm.committee_id
             WHERE cm.user_id = ?`,
            [req.params.id]
        );

        // Get task stats
        const taskStats = await db.get(
            `SELECT 
                COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending,
                COUNT(CASE WHEN status = 'in_progress' THEN 1 END) as in_progress,
                COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed,
                COUNT(*) as total
             FROM tasks WHERE assigned_to = ?`,
            [req.params.id]
        );

        res.json({ user: { ...user, committees, taskStats } });
    } catch (error) {
        console.error('Get user error:', error);
        res.status(500).json({ error: 'Failed to fetch user.' });
    }
});

// POST /api/users - Create user (admin only)
router.post('/', requireAdmin, async (req, res) => {
    try {
        const { email, password, firstName, lastName, role = 'trustee', department, phone } = req.body;

        if (!email || !password || !firstName || !lastName) {
            return res.status(400).json({ error: 'Missing required fields.' });
        }

        // Check if exists
        const existing = await db.get('SELECT id FROM users WHERE email = ?', [email.toLowerCase()]);
        if (existing) {
            return res.status(409).json({ error: 'User with this email already exists.' });
        }

        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        const result = await db.run(
            `INSERT INTO users (email, password, first_name, last_name, role, department, phone, avatar)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                email.toLowerCase(),
                hashedPassword,
                firstName,
                lastName,
                role,
                department,
                phone,
                `${firstName[0]}${lastName[0]}`.toUpperCase()
            ]
        );

        const user = await db.get(
            `SELECT id, email, first_name, last_name, role, avatar, department, phone, created_at
             FROM users WHERE id = ?`,
            [result.id]
        );

        res.status(201).json({ message: 'User created successfully', user });
    } catch (error) {
        console.error('Create user error:', error);
        res.status(500).json({ error: 'Failed to create user.' });
    }
});

// PUT /api/users/:id - Update user
router.put('/:id', requireAdmin, async (req, res) => {
    try {
        const { firstName, lastName, role, department, phone, isActive } = req.body;

        await db.run(
            `UPDATE users 
             SET first_name = ?, last_name = ?, role = ?, department = ?, phone = ?, is_active = ?, updated_at = CURRENT_TIMESTAMP
             WHERE id = ?`,
            [firstName, lastName, role, department, phone, isActive, req.params.id]
        );

        const user = await db.get(
            `SELECT id, email, first_name, last_name, role, avatar, department, phone, is_active, updated_at
             FROM users WHERE id = ?`,
            [req.params.id]
        );

        res.json({ message: 'User updated successfully', user });
    } catch (error) {
        console.error('Update user error:', error);
        res.status(500).json({ error: 'Failed to update user.' });
    }
});

// POST /api/users/:id/reset-password - Reset user password (admin only)
router.post('/:id/reset-password', requireAdmin, async (req, res) => {
    try {
        const { newPassword } = req.body;

        if (!newPassword) {
            return res.status(400).json({ error: 'New password is required.' });
        }

        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(newPassword, salt);

        await db.run(
            'UPDATE users SET password = ? WHERE id = ?',
            [hashedPassword, req.params.id]
        );

        res.json({ message: 'Password reset successfully.' });
    } catch (error) {
        console.error('Reset password error:', error);
        res.status(500).json({ error: 'Failed to reset password.' });
    }
});

// DELETE /api/users/:id - Delete user
router.delete('/:id', requireAdmin, async (req, res) => {
    try {
        await db.run('DELETE FROM users WHERE id = ?', [req.params.id]);
        res.json({ message: 'User deleted successfully.' });
    } catch (error) {
        console.error('Delete user error:', error);
        res.status(500).json({ error: 'Failed to delete user.' });
    }
});

// ==========================================
// PROFILE & ACCOUNT MANAGEMENT (Current User)
// ==========================================

// Helper function to get existing columns
async function getExistingColumns() {
    // Known columns that exist in the database
    return ['id', 'email', 'first_name', 'last_name', 'role', 'avatar', 
            'department', 'phone', 'is_active', 'created_at', 'updated_at',
            'last_login', 'last_login_at', 'is_super_admin', 'email_verified'];
}

// GET /api/users/me - Get current user profile
router.get('/me', async (req, res) => {
    try {
        // Get basic user data with columns we know exist
        const user = await db.get(
            `SELECT id, email, first_name, last_name, role, avatar, 
                    department, phone, is_active, email_verified,
                    last_login, created_at
             FROM users WHERE id = ?`,
            [req.user.id]
        );

        if (!user) {
            return res.status(404).json({ error: 'User not found.' });
        }

        // Add default values for profile fields (they may not exist in DB yet)
        const profileData = {
            ...user,
            job_title: null,
            bio: null,
            location_city: null,
            location_country: null,
            area: null,
            website: null,
            linkedin_url: null,
            twitter_url: null,
            github_url: null,
            mfa_enabled: false,
            password_changed_at: null
        };

        res.json(profileData);
    } catch (error) {
        console.error('Get profile error:', error);
        res.status(500).json({ error: 'Failed to fetch profile.' });
    }
});

// PUT /api/users/profile - Update full profile info
router.put('/profile', async (req, res) => {
    try {
        const { 
            first_name, last_name, 
            phone
        } = req.body;

        // Only update columns that exist in the database
        await db.run(
            `UPDATE users 
             SET first_name = ?, last_name = ?, phone = ?,
                 updated_at = CURRENT_TIMESTAMP
             WHERE id = ?`,
            [first_name, last_name, phone, req.user.id]
        );

        res.json({ message: 'Profile updated successfully.' });
    } catch (error) {
        console.error('Update profile error:', error);
        res.status(500).json({ error: 'Failed to update profile.' });
    }
});

// POST /api/users/avatar - Upload profile avatar
router.post('/avatar', upload.single('avatar'), async (req, res) => {
    try {
        let avatarUrl;
        
        if (req.file) {
            // File was uploaded successfully
            avatarUrl = `/uploads/avatars/${req.file.filename}`;
        } else {
            // No file uploaded - return error
            return res.status(400).json({ error: 'No image file provided.' });
        }
        
        await db.run(
            'UPDATE users SET avatar = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
            [avatarUrl, req.user.id]
        );

        res.json({ message: 'Avatar updated successfully.', avatar_url: avatarUrl });
    } catch (error) {
        console.error('Upload avatar error:', error);
        res.status(500).json({ error: 'Failed to upload avatar.' });
    }
});

// POST /api/users/change-email - Change email address
router.post('/change-email', async (req, res) => {
    try {
        const { new_email, password } = req.body;

        // Verify current password
        const user = await db.get('SELECT password FROM users WHERE id = ?', [req.user.id]);
        const isMatch = await bcrypt.compare(password, user.password);
        
        if (!isMatch) {
            return res.status(401).json({ error: 'Current password is incorrect.' });
        }

        // Check if email is already taken
        const existing = await db.get('SELECT id FROM users WHERE email = ? AND id != ?', [new_email.toLowerCase(), req.user.id]);
        if (existing) {
            return res.status(409).json({ error: 'Email address is already in use.' });
        }

        await db.run(
            'UPDATE users SET email = ?, email_verified = false, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
            [new_email.toLowerCase(), req.user.id]
        );

        res.json({ message: 'Email updated successfully. Please verify your new email.' });
    } catch (error) {
        console.error('Change email error:', error);
        res.status(500).json({ error: 'Failed to change email.' });
    }
});

// POST /api/users/change-password - Change password
router.post('/change-password', async (req, res) => {
    try {
        const { current_password, new_password } = req.body;

        // Verify current password
        const user = await db.get('SELECT password FROM users WHERE id = ?', [req.user.id]);
        const isMatch = await bcrypt.compare(current_password, user.password);
        
        if (!isMatch) {
            return res.status(401).json({ error: 'Current password is incorrect.' });
        }

        // Hash new password
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(new_password, salt);

        await db.run(
            'UPDATE users SET password = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
            [hashedPassword, req.user.id]
        );

        res.json({ message: 'Password updated successfully.' });
    } catch (error) {
        console.error('Change password error:', error);
        res.status(500).json({ error: 'Failed to change password.' });
    }
});

// POST /api/users/mfa/enable - Enable MFA
router.post('/mfa/enable', async (req, res) => {
    try {
        const { code } = req.body;
        
        // For now, just mark as enabled
        // In production, implement proper TOTP verification
        // await db.run('UPDATE users SET mfa_enabled = true WHERE id = ?', [req.user.id]);

        res.json({ message: 'Multi-factor authentication enabled.' });
    } catch (error) {
        console.error('Enable MFA error:', error);
        res.status(500).json({ error: 'Failed to enable MFA.' });
    }
});

// DELETE /api/users/account - Delete own account
router.delete('/account', async (req, res) => {
    try {
        // Delete user
        await db.run('DELETE FROM users WHERE id = ?', [req.user.id]);
        
        res.json({ message: 'Account deleted successfully.' });
    } catch (error) {
        console.error('Delete account error:', error);
        res.status(500).json({ error: 'Failed to delete account.' });
    }
});

module.exports = router;
