const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const db = require('../config/database');
const { generateToken, verifyInvitationToken } = require('../middleware/auth-saas');

/**
 * @route   POST /api/auth/saas/login
 * @desc    Authenticate user with optional organization context
 * @access  Public
 */
router.post('/login', async (req, res) => {
    try {
        const { email, password, organization_id } = req.body;

        if (!email || !password) {
            return res.status(400).json({
                error: 'Missing credentials',
                message: 'Please provide both email and password.'
            });
        }

        // Find user using table API
        const users = await db.query('users', {
            where: { email: email.toLowerCase() },
            select: 'id, email, password, first_name, last_name, avatar, is_active, is_super_admin, email_verified, timezone, language'
        });
        const user = users[0];

        if (!user) {
            return res.status(401).json({
                error: 'Invalid credentials',
                message: 'The email or password you entered is incorrect.'
            });
        }

        // Check if user is active (handle missing is_active field)
        if (user.is_active === false) {
            return res.status(403).json({
                error: 'Account deactivated',
                message: 'Your account has been deactivated. Please contact support.'
            });
        }

        // Verify password
        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(401).json({
                error: 'Invalid credentials',
                message: 'The email or password you entered is incorrect.'
            });
        }

        // Update last login
        await db.update('users', 
            { last_login_at: new Date().toISOString(), last_login_ip: req.ip },
            { id: user.id }
        );

        // If organization_id is provided, verify membership
        let organization = null;
        let member = null;

        if (organization_id) {
            // Use table API instead of JOIN
            const memberships = await db.query('organization_members', {
                where: { user_id: user.id, organization_id: organization_id, is_active: true },
                select: '*, organizations(*)'
            });

            if (memberships.length > 0) {
                const m = memberships[0];
                const org = m.organizations;
                if (org && org.is_active) {
                    member = m;
                    organization = {
                        id: org.id,
                        name: org.name,
                        slug: org.slug,
                        subscription_status: org.subscription_status,
                        trial_ends_at: org.trial_ends_at,
                        custom_domain: org.custom_domain,
                        logo_url: org.logo_url,
                        primary_color: org.primary_color
                    };

                    // Update last active
                    await db.update('organization_members', 
                        { last_active_at: new Date().toISOString() },
                        { id: m.id }
                    );
                }
            }
        }

        // If no specific organization requested or not a member, get all organizations
        let organizations = [];
        if (!organization) {
            // Use table API instead of JOIN
            const memberships = await db.query('organization_members', {
                where: { user_id: user.id, is_active: true },
                select: 'role, organizations(*)'
            });

            // Filter active organizations
            organizations = memberships
                .filter(m => m.organizations && m.organizations.is_active)
                .map(m => ({
                    id: m.organizations.id,
                    name: m.organizations.name,
                    slug: m.organizations.slug,
                    logo_url: m.organizations.logo_url,
                    subscription_status: m.organizations.subscription_status,
                    role: m.role
                }));

            // If user has only one organization, auto-select it
            if (organizations.length === 1 && !user.is_super_admin) {
                organization = organizations[0];
                member = { role: organizations[0].role };
            }
        }

        // Generate token
        const token = generateToken(
            user,
            organization?.id,
            member?.role
        );

        const response = {
            message: 'Login successful',
            token,
            user: {
                id: user.id,
                email: user.email,
                first_name: user.first_name,
                last_name: user.last_name,
                avatar: user.avatar,
                is_super_admin: user.is_super_admin,
                email_verified: user.email_verified,
                timezone: user.timezone,
                language: user.language
            }
        };

        // Include organization context if available
        if (organization) {
            response.organization = organization;
            response.role = member.role;
        } else if (organizations.length > 0) {
            response.organizations = organizations;
            response.requires_organization_selection = true;
        }

        res.json(response);

    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({
            error: 'Login failed',
            message: 'An error occurred during login. Please try again.'
        });
    }
});

/**
 * @route   POST /api/auth/saas/select-organization
 * @desc    Select an organization after login (for users with multiple orgs)
 * @access  Private
 */
router.post('/select-organization', async (req, res) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({
                error: 'Authentication required',
                message: 'Please login first.'
            });
        }

        // Decode token without verification to get user id
        const token = authHeader.substring(7);
        const tokenParts = token.split('.');
        const payload = JSON.parse(Buffer.from(tokenParts[1], 'base64').toString());

        const { organization_id } = req.body;

        if (!organization_id) {
            return res.status(400).json({
                error: 'Organization required',
                message: 'Please provide an organization ID.'
            });
        }

        // Verify membership
        const member = await db.get(
            `SELECT om.*, o.name as org_name, o.slug as org_slug, o.subscription_status,
                    o.trial_ends_at, o.custom_domain, o.logo_url, o.primary_color,
                    u.id as user_id, u.email, u.first_name, u.last_name, u.avatar, 
                    u.is_super_admin, u.email_verified, u.timezone, u.language
             FROM organization_members om
             JOIN organizations o ON om.organization_id = o.id
             JOIN users u ON om.user_id = u.id
             WHERE om.user_id = ? AND om.organization_id = ? AND om.is_active = 1 AND o.is_active = 1`,
            [payload.id, organization_id]
        );

        if (!member) {
            return res.status(403).json({
                error: 'Access denied',
                message: 'You are not a member of this organization.'
            });
        }

        // Update last active
        await db.run(
            'UPDATE organization_members SET last_active_at = CURRENT_TIMESTAMP WHERE id = ?',
            [member.id]
        );

        // Generate new token with organization context
        const newToken = generateToken(
            {
                id: member.user_id,
                email: member.email,
                is_super_admin: member.is_super_admin
            },
            organization_id,
            member.role
        );

        res.json({
            message: 'Organization selected',
            token: newToken,
            user: {
                id: member.user_id,
                email: member.email,
                first_name: member.first_name,
                last_name: member.last_name,
                avatar: member.avatar,
                is_super_admin: member.is_super_admin,
                email_verified: member.email_verified,
                timezone: member.timezone,
                language: member.language
            },
            organization: {
                id: organization_id,
                name: member.org_name,
                slug: member.org_slug,
                subscription_status: member.subscription_status,
                trial_ends_at: member.trial_ends_at,
                custom_domain: member.custom_domain,
                logo_url: member.logo_url,
                primary_color: member.primary_color
            },
            role: member.role
        });

    } catch (error) {
        console.error('Select organization error:', error);
        res.status(500).json({
            error: 'Failed to select organization'
        });
    }
});

/**
 * @route   POST /api/auth/saas/register
 * @desc    Register a new user with organization
 * @access  Public
 */
router.post('/register', async (req, res) => {
    try {
        const {
            email,
            password,
            first_name,
            last_name,
            organization_name,
            organization_slug,
            invitation_token
        } = req.body;

        // If invitation token provided, accept invitation
        if (invitation_token) {
            return acceptInvitation(req, res);
        }

        // Otherwise, create new organization with user as owner
        if (!email || !password || !first_name || !last_name || !organization_name || !organization_slug) {
            return res.status(400).json({
                error: 'Missing required fields',
                message: 'Please provide all required fields.'
            });
        }

        // Validate password strength
        if (password.length < 8) {
            return res.status(400).json({
                error: 'Weak password',
                message: 'Password must be at least 8 characters long.'
            });
        }

        // Check if email exists
        const existingUser = await db.get('SELECT id FROM users WHERE email = ?', [email.toLowerCase()]);
        if (existingUser) {
            return res.status(409).json({
                error: 'Email already registered',
                message: 'This email is already associated with an account. Please login instead.'
            });
        }

        // Check slug availability
        const existingOrg = await db.get('SELECT id FROM organizations WHERE slug = ?', [organization_slug]);
        if (existingOrg) {
            return res.status(409).json({
                error: 'Organization slug unavailable',
                message: 'This organization URL is already taken. Please choose another.'
            });
        }

        // Get starter plan
        const starterPlan = await db.get("SELECT id FROM subscription_plans WHERE slug = 'starter'");

        // Generate verification token
        const verificationToken = crypto.randomBytes(32).toString('hex');

        // Hash password
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        // Set trial end
        const trialEndsAt = new Date();
        trialEndsAt.setDate(trialEndsAt.getDate() + 14);

        // Transaction
        await db.run('BEGIN TRANSACTION');

        try {
            // Create user
            const userResult = await db.run(
                `INSERT INTO users (email, password, first_name, last_name, verification_token)
                 VALUES (?, ?, ?, ?, ?)`,
                [email.toLowerCase(), hashedPassword, first_name, last_name, verificationToken]
            );
            const userId = userResult.id;

            // Create organization
            const orgResult = await db.run(
                `INSERT INTO organizations 
                 (name, slug, billing_email, plan_id, subscription_status, trial_ends_at, created_by)
                 VALUES (?, ?, ?, ?, 'trial', ?, ?)`,
                [organization_name, organization_slug, email, starterPlan.id, trialEndsAt.toISOString(), userId]
            );
            const organizationId = orgResult.id;

            // Create membership
            await db.run(
                `INSERT INTO organization_members (organization_id, user_id, role, joined_at)
                 VALUES (?, ?, 'owner', CURRENT_TIMESTAMP)`,
                [organizationId, userId]
            );

            await db.run('COMMIT');

            // Generate token
            const token = generateToken(
                { id: userId, email },
                organizationId,
                'owner'
            );

            res.status(201).json({
                message: 'Registration successful!',
                token,
                user: {
                    id: userId,
                    email,
                    first_name,
                    last_name,
                    email_verified: false
                },
                organization: {
                    id: organizationId,
                    name: organization_name,
                    slug: organization_slug,
                    subscription_status: 'trial',
                    trial_ends_at: trialEndsAt.toISOString()
                },
                role: 'owner',
                requires_email_verification: true
            });

        } catch (error) {
            await db.run('ROLLBACK');
            throw error;
        }

    } catch (error) {
        console.error('Registration error:', error);
        res.status(500).json({
            error: 'Registration failed',
            message: 'An error occurred during registration. Please try again.'
        });
    }
});

/**
 * @route   POST /api/auth/saas/accept-invitation
 * @desc    Accept an organization invitation
 * @access  Public
 */
router.post('/accept-invitation', async (req, res) => {
    await acceptInvitation(req, res);
});

async function acceptInvitation(req, res) {
    try {
        const { token, password, first_name, last_name } = req.body;

        if (!token) {
            return res.status(400).json({
                error: 'Invitation token required'
            });
        }

        // Find invitation
        const invitation = await db.get(
            `SELECT oi.*, o.name as org_name, o.slug as org_slug
             FROM organization_invitations oi
             JOIN organizations o ON oi.organization_id = o.id
             WHERE oi.token = ? AND oi.accepted_at IS NULL AND oi.expires_at > datetime('now')`,
            [token]
        );
        if (!invitation) {
            return res.status(400).json({
                error: 'Invalid invitation',
                message: 'This invitation is invalid or has expired.'
            });
        }

        // Check if user already exists
        let user = await db.get('SELECT * FROM users WHERE email = ?', [invitation.email]);
        let userId;

        if (user) {
            // Existing user - just add to organization
            const existingMember = await db.get(
                'SELECT id FROM organization_members WHERE organization_id = ? AND user_id = ?',
                [invitation.organization_id, user.id]
            );

            if (existingMember) {
                return res.status(409).json({
                    error: 'Already a member',
                    message: 'You are already a member of this organization.'
                });
            }

            userId = user.id;
        } else {
            // New user - need password and name
            if (!password || !first_name || !last_name) {
                return res.status(400).json({
                    error: 'Registration required',
                    message: 'Please provide password, first name, and last name to create your account.',
                    requires_registration: true
                });
            }

            // Create new user
            const salt = await bcrypt.genSalt(10);
            const hashedPassword = await bcrypt.hash(password, salt);

            const userResult = await db.run(
                `INSERT INTO users (email, password, first_name, last_name, email_verified)
                 VALUES (?, ?, ?, ?, 1)`,
                [invitation.email, hashedPassword, first_name, last_name]
            );
            userId = userResult.id;
        }

        // Calculate term end date if term data exists
        let termEndDate = null;
        if (invitation.term_start_date && invitation.term_length_years) {
            const endDate = new Date(invitation.term_start_date);
            endDate.setFullYear(endDate.getFullYear() + parseInt(invitation.term_length_years));
            termEndDate = endDate.toISOString().split('T')[0];
        }

        // Add to organization
        await db.run(
            `INSERT INTO organization_members 
             (organization_id, user_id, role, department, invited_by, invited_at, joined_at, 
              term_length_years, term_start_date, term_end_date)
             VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, ?, ?, ?)`,
            [invitation.organization_id, userId, invitation.role, invitation.department, 
             invitation.invited_by, invitation.invited_at,
             invitation.term_length_years, invitation.term_start_date, termEndDate]
        );

        // Mark invitation as accepted
        await db.run(
            'UPDATE organization_invitations SET accepted_at = CURRENT_TIMESTAMP WHERE id = ?',
            [invitation.id]
        );

        // Get full user info
        user = await db.get(
            'SELECT id, email, first_name, last_name, avatar, is_super_admin, email_verified FROM users WHERE id = ?',
            [userId]
        );

        // Generate token
        const authToken = generateToken(
            user,
            invitation.organization_id,
            invitation.role
        );

        res.json({
            message: 'Invitation accepted successfully!',
            token: authToken,
            user: {
                id: user.id,
                email: user.email,
                first_name: user.first_name,
                last_name: user.last_name,
                avatar: user.avatar,
                email_verified: true
            },
            organization: {
                id: invitation.organization_id,
                name: invitation.org_name,
                slug: invitation.org_slug
            },
            role: invitation.role
        });

    } catch (error) {
        console.error('Accept invitation error:', error);
        res.status(500).json({
            error: 'Failed to accept invitation',
            message: 'An error occurred. Please try again.'
        });
    }
}

/**
 * @route   POST /api/auth/saas/forgot-password
 * @desc    Request password reset
 * @access  Public
 */
router.post('/forgot-password', async (req, res) => {
    try {
        const { email } = req.body;

        if (!email) {
            return res.status(400).json({
                error: 'Email required'
            });
        }

        const user = await db.get('SELECT id, email, first_name FROM users WHERE email = ?', [email.toLowerCase()]);

        // Always return success to prevent email enumeration
        if (!user) {
            return res.json({
                message: 'If an account exists with this email, a password reset link has been sent.'
            });
        }

        // Generate reset token
        const resetToken = crypto.randomBytes(32).toString('hex');
        const resetExpires = new Date();
        resetExpires.setHours(resetExpires.getHours() + 1);

        await db.run(
            'UPDATE users SET reset_password_token = ?, reset_password_expires = ? WHERE id = ?',
            [resetToken, resetExpires.toISOString(), user.id]
        );

        // TODO: Send password reset email
        // await sendPasswordResetEmail(user.email, user.first_name, resetToken);

        res.json({
            message: 'If an account exists with this email, a password reset link has been sent.',
            // In development, return the token
            ...(process.env.NODE_ENV === 'development' && { reset_token: resetToken })
        });

    } catch (error) {
        console.error('Forgot password error:', error);
        res.status(500).json({
            error: 'Failed to process request'
        });
    }
});

/**
 * @route   POST /api/auth/saas/reset-password
 * @desc    Reset password with token
 * @access  Public
 */
router.post('/reset-password', async (req, res) => {
    try {
        const { token, password } = req.body;

        if (!token || !password) {
            return res.status(400).json({
                error: 'Token and password required'
            });
        }

        if (password.length < 8) {
            return res.status(400).json({
                error: 'Weak password',
                message: 'Password must be at least 8 characters long.'
            });
        }

        const user = await db.get(
            'SELECT id FROM users WHERE reset_password_token = ? AND reset_password_expires > datetime("now")',
            [token]
        );

        if (!user) {
            return res.status(400).json({
                error: 'Invalid token',
                message: 'This password reset link is invalid or has expired.'
            });
        }

        // Hash new password
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        await db.run(
            'UPDATE users SET password = ?, reset_password_token = NULL, reset_password_expires = NULL WHERE id = ?',
            [hashedPassword, user.id]
        );

        res.json({
            message: 'Password reset successfully. You can now login with your new password.'
        });

    } catch (error) {
        console.error('Reset password error:', error);
        res.status(500).json({
            error: 'Failed to reset password'
        });
    }
});

/**
 * @route   POST /api/auth/saas/verify-email
 * @desc    Verify email address
 * @access  Public
 */
router.post('/verify-email', async (req, res) => {
    try {
        const { token } = req.body;

        if (!token) {
            return res.status(400).json({
                error: 'Verification token required'
            });
        }

        const user = await db.get(
            'SELECT id FROM users WHERE verification_token = ?',
            [token]
        );

        if (!user) {
            return res.status(400).json({
                error: 'Invalid token',
                message: 'This verification link is invalid or has expired.'
            });
        }

        await db.run(
            'UPDATE users SET email_verified = 1, verification_token = NULL, email_verified_at = CURRENT_TIMESTAMP WHERE id = ?',
            [user.id]
        );

        res.json({
            message: 'Email verified successfully!'
        });

    } catch (error) {
        console.error('Verify email error:', error);
        res.status(500).json({
            error: 'Failed to verify email'
        });
    }
});

/**
 * @route   GET /api/auth/saas/me
 * @desc    Get current user with organization context
 * @access  Private
 */
router.get('/me', async (req, res) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({
                error: 'Authentication required'
            });
        }

        // Decode token to get user and org info
        const token = authHeader.substring(7);
        const tokenParts = token.split('.');
        const payload = JSON.parse(Buffer.from(tokenParts[1], 'base64').toString());

        // Get basic user data first (columns that definitely exist)
        let user;
        try {
            user = await db.get(
                `SELECT id, email, first_name, last_name, avatar, is_super_admin, 
                        email_verified, timezone, language, created_at
                 FROM users WHERE id = ?`,
                [payload.id]
            );
        } catch (error) {
            console.error('Error fetching basic user data:', error);
            return res.status(500).json({ error: 'Failed to fetch user data' });
        }

        if (!user) {
            return res.status(401).json({
                error: 'User not found'
            });
        }

        // Try to get extended profile fields separately (may not exist in DB yet)
        let profileFields = {};
        try {
            const profileData = await db.get(
                `SELECT job_title, bio, location_city, location_country, phone,
                        area, website, linkedin_url, twitter_url, github_url
                 FROM users WHERE id = ?`,
                [payload.id]
            );
            if (profileData) {
                profileFields = profileData;
            }
        } catch (error) {
            // Profile columns don't exist yet - that's OK, return empty values
            console.log('Profile columns not yet in database - returning defaults');
            profileFields = {
                job_title: null, bio: null, location_city: null, location_country: null,
                phone: null, area: null, website: null, 
                linkedin_url: null, twitter_url: null, github_url: null
            };
        }

        const response = {
            user: {
                id: user.id,
                email: user.email,
                first_name: user.first_name,
                last_name: user.last_name,
                avatar: user.avatar,
                is_super_admin: user.is_super_admin,
                email_verified: user.email_verified,
                timezone: user.timezone,
                language: user.language,
                created_at: user.created_at,
                // Profile fields (with defaults if not found)
                job_title: profileFields.job_title || '',
                bio: profileFields.bio || '',
                location_city: profileFields.location_city || '',
                location_country: profileFields.location_country || '',
                phone: profileFields.phone || '',
                area: profileFields.area || '',
                website: profileFields.website || '',
                linkedin_url: profileFields.linkedin_url || '',
                twitter_url: profileFields.twitter_url || '',
                github_url: profileFields.github_url || ''
            }
        };

        // If organization context exists, include it
        if (payload.organization_id) {
            const member = await db.get(
                `SELECT om.*, o.name as org_name, o.slug as org_slug, o.subscription_status,
                        o.trial_ends_at, o.custom_domain, o.logo_url, o.primary_color
                 FROM organization_members om
                 JOIN organizations o ON om.organization_id = o.id
                 WHERE om.user_id = ? AND om.organization_id = ?`,
                [user.id, payload.organization_id]
            );

            if (member) {
                response.organization = {
                    id: payload.organization_id,
                    name: member.org_name,
                    slug: member.org_slug,
                    subscription_status: member.subscription_status,
                    trial_ends_at: member.trial_ends_at,
                    custom_domain: member.custom_domain,
                    logo_url: member.logo_url,
                    primary_color: member.primary_color
                };
                response.membership = {
                    role: member.role,
                    department: member.department,
                    title: member.title,
                    joined_at: member.joined_at
                };
            }
        }

        res.json(response);

    } catch (error) {
        console.error('Get current user error:', error);
        res.status(500).json({
            error: 'Failed to get user information'
        });
    }
});

/**
 * @route   PUT /api/auth/saas/profile
 * @desc    Update current user profile - Syncs with organization member details
 * @access  Private
 */
router.put('/profile', async (req, res) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({
                error: 'Authentication required'
            });
        }

        // Decode token to get user id and organization
        const token = authHeader.substring(7);
        const tokenParts = token.split('.');
        const payload = JSON.parse(Buffer.from(tokenParts[1], 'base64').toString());

        const {
            first_name, last_name, job_title, bio,
            location_city, location_country, phone,
            area, website, linkedin_url, twitter_url, github_url,
            department  // Can also update department from profile
        } = req.body;

        // Update user profile using the table API
        const updateData = {};
        if (first_name !== undefined) updateData.first_name = first_name;
        if (last_name !== undefined) updateData.last_name = last_name;
        if (job_title !== undefined) updateData.job_title = job_title;
        if (bio !== undefined) updateData.bio = bio;
        if (location_city !== undefined) updateData.location_city = location_city;
        if (location_country !== undefined) updateData.location_country = location_country;
        if (phone !== undefined) updateData.phone = phone;
        if (area !== undefined) updateData.area = area;
        if (website !== undefined) updateData.website = website;
        if (linkedin_url !== undefined) updateData.linkedin_url = linkedin_url;
        if (twitter_url !== undefined) updateData.twitter_url = twitter_url;
        if (github_url !== undefined) updateData.github_url = github_url;

        // Try to update user profile - may fail if columns don't exist yet
        try {
            await db.update('users', updateData, { id: payload.id });
        } catch (dbError) {
            console.error('Database update error (profile columns may not exist):', dbError.message);
            // Still try to update basic fields that definitely exist
            const basicUpdate = {};
            if (first_name !== undefined) basicUpdate.first_name = first_name;
            if (last_name !== undefined) basicUpdate.last_name = last_name;
            if (Object.keys(basicUpdate).length > 0) {
                await db.update('users', basicUpdate, { id: payload.id });
            }
        }

        // SYNC: Also update organization_members if user has an organization context
        if (payload.organization_id) {
            const memberUpdateData = {};
            
            // Sync job_title with organization_members.title
            if (job_title !== undefined) memberUpdateData.title = job_title;
            // Sync department
            if (department !== undefined) memberUpdateData.department = department;
            
            if (Object.keys(memberUpdateData).length > 0) {
                await db.update('organization_members', memberUpdateData, { 
                    organization_id: payload.organization_id,
                    user_id: payload.id 
                });
            }
        }

        // Get updated user (basic fields only - safe query)
        let user;
        try {
            user = await db.get(
                `SELECT id, email, first_name, last_name, avatar
                 FROM users WHERE id = ?`,
                [payload.id]
            );
        } catch (error) {
            user = { id: payload.id };
        }

        // Merge with submitted data for response
        const responseUser = {
            ...user,
            job_title: job_title || '',
            bio: bio || '',
            location_city: location_city || '',
            location_country: location_country || '',
            phone: phone || '',
            area: area || '',
            website: website || '',
            linkedin_url: linkedin_url || '',
            twitter_url: twitter_url || '',
            github_url: github_url || ''
        };

        res.json({
            message: 'Profile updated successfully',
            user: responseUser
        });

    } catch (error) {
        console.error('Update profile error:', error);
        res.status(500).json({
            error: 'Failed to update profile'
        });
    }
});

module.exports = router;
