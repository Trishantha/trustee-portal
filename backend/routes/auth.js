const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../config/database');
const { generateToken, authenticate } = require('../middleware/auth');

const router = express.Router();

// POST /api/auth/login - User login
router.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({ error: 'Email and password are required.' });
        }

        // Get user with password
        const user = await db.get(
            'SELECT * FROM users WHERE email = ?',
            [email.toLowerCase()]
        );

        if (!user) {
            return res.status(401).json({ error: 'Invalid credentials.' });
        }

        if (!user.is_active) {
            return res.status(403).json({ error: 'Account is deactivated.' });
        }

        // Verify password
        const isValidPassword = await bcrypt.compare(password, user.password);

        if (!isValidPassword) {
            return res.status(401).json({ error: 'Invalid credentials.' });
        }

        // Update last login
        await db.run(
            'UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = ?',
            [user.id]
        );

        // Generate token
        const token = generateToken(user);

        // Remove password from response
        delete user.password;

        res.json({
            message: 'Login successful',
            user,
            token
        });
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ error: 'Login failed.' });
    }
});

// POST /api/auth/register - Register new user (admin only in production)
router.post('/register', async (req, res) => {
    try {
        const { email, password, firstName, lastName, role = 'trustee' } = req.body;

        if (!email || !password || !firstName || !lastName) {
            return res.status(400).json({ 
                error: 'Email, password, first name, and last name are required.' 
            });
        }

        // Check if user exists
        const existingUser = await db.get(
            'SELECT id FROM users WHERE email = ?',
            [email.toLowerCase()]
        );

        if (existingUser) {
            return res.status(409).json({ error: 'User already exists.' });
        }

        // Hash password
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        // Create user
        const result = await db.run(
            `INSERT INTO users (email, password, first_name, last_name, role, avatar)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [
                email.toLowerCase(),
                hashedPassword,
                firstName,
                lastName,
                role,
                `${firstName[0]}${lastName[0]}`.toUpperCase()
            ]
        );

        const user = await db.get(
            'SELECT id, email, first_name, last_name, role, avatar, created_at FROM users WHERE id = ?',
            [result.id]
        );

        const token = generateToken(user);

        res.status(201).json({
            message: 'User registered successfully',
            user,
            token
        });
    } catch (error) {
        console.error('Registration error:', error);
        res.status(500).json({ error: 'Registration failed.' });
    }
});

// GET /api/auth/me - Get current user
router.get('/me', authenticate, async (req, res) => {
    try {
        const user = await db.get(
            `SELECT id, email, first_name, last_name, role, avatar, 
                    department, phone, bio, is_active, last_login, created_at
             FROM users WHERE id = ?`,
            [req.user.id]
        );

        if (!user) {
            return res.status(404).json({ error: 'User not found.' });
        }

        res.json({ user });
    } catch (error) {
        console.error('Get user error:', error);
        res.status(500).json({ error: 'Failed to get user information.' });
    }
});

// PUT /api/auth/profile - Update user profile
router.put('/profile', authenticate, async (req, res) => {
    try {
        const { firstName, lastName, department, phone, bio } = req.body;

        await db.run(
            `UPDATE users 
             SET first_name = ?, last_name = ?, department = ?, phone = ?, bio = ?, updated_at = CURRENT_TIMESTAMP
             WHERE id = ?`,
            [firstName, lastName, department, phone, bio, req.user.id]
        );

        const user = await db.get(
            `SELECT id, email, first_name, last_name, role, avatar, 
                    department, phone, bio, updated_at
             FROM users WHERE id = ?`,
            [req.user.id]
        );

        res.json({
            message: 'Profile updated successfully',
            user
        });
    } catch (error) {
        console.error('Profile update error:', error);
        res.status(500).json({ error: 'Failed to update profile.' });
    }
});

// POST /api/auth/change-password - Change password
router.post('/change-password', authenticate, async (req, res) => {
    try {
        const { currentPassword, newPassword } = req.body;

        if (!currentPassword || !newPassword) {
            return res.status(400).json({ error: 'Current and new password are required.' });
        }

        // Get current password hash
        const user = await db.get(
            'SELECT password FROM users WHERE id = ?',
            [req.user.id]
        );

        // Verify current password
        const isValid = await bcrypt.compare(currentPassword, user.password);
        if (!isValid) {
            return res.status(401).json({ error: 'Current password is incorrect.' });
        }

        // Hash new password
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(newPassword, salt);

        await db.run(
            'UPDATE users SET password = ? WHERE id = ?',
            [hashedPassword, req.user.id]
        );

        res.json({ message: 'Password changed successfully.' });
    } catch (error) {
        console.error('Password change error:', error);
        res.status(500).json({ error: 'Failed to change password.' });
    }
});

module.exports = router;
