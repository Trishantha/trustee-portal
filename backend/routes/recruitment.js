const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const db = require('../config/database');
const { authenticate, requireAdminOrChair } = require('../middleware/auth');
const emailService = require('../services/email');

const router = express.Router();

// Ensure uploads directory exists
const uploadsDir = path.join(__dirname, '..', 'uploads', 'cvs');
if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
}

// Configure multer for CV uploads
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, uploadsDir);
    },
    filename: function (req, file, cb) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, 'cv-' + uniqueSuffix + path.extname(file.originalname));
    }
});

const fileFilter = (req, file, cb) => {
    const allowedTypes = ['.pdf', '.doc', '.docx'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowedTypes.includes(ext)) {
        cb(null, true);
    } else {
        cb(new Error('Invalid file type. Only PDF, DOC, and DOCX allowed.'), false);
    }
};

const upload = multer({ 
    storage: storage,
    fileFilter: fileFilter,
    limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit
});

// PUBLIC ENDPOINTS (No authentication required)

// GET /api/recruitment/jobs/:id - Get single job (public for applicants)
router.get('/jobs/:id', async (req, res) => {
    try {
        const job = await db.get(
            `SELECT j.*, 
                    u.first_name || ' ' || u.last_name as created_by_name
             FROM job_openings j
             LEFT JOIN users u ON j.created_by = u.id
             WHERE j.id = ? AND j.status = 'active'`,
            [req.params.id]
        );

        if (!job) {
            return res.status(404).json({ error: 'Job not found or no longer active.' });
        }

        res.json({ job });
    } catch (error) {
        console.error('Get job error:', error);
        res.status(500).json({ error: 'Failed to fetch job details.' });
    }
});

// POST /api/recruitment/apply - Submit application (public)
router.post('/apply', upload.single('cv'), async (req, res) => {
    try {
        const { jobId, firstName, lastName, email, phone, coverLetter } = req.body;

        if (!jobId || !firstName || !lastName || !email) {
            return res.status(400).json({ error: 'Missing required fields.' });
        }

        // Check if job exists and is active
        const job = await db.get(
            'SELECT id, title, status, expiry_date FROM job_openings WHERE id = ?',
            [jobId]
        );

        if (!job) {
            return res.status(404).json({ error: 'Job not found.' });
        }

        if (job.status !== 'active') {
            return res.status(400).json({ error: 'This position is no longer accepting applications.' });
        }

        if (new Date(job.expiry_date) < new Date()) {
            return res.status(400).json({ error: 'Application deadline has passed.' });
        }

        // Get CV file path if uploaded
        const cvPath = req.file ? `/uploads/cvs/${req.file.filename}` : null;

        const result = await db.run(
            `INSERT INTO applications (job_id, first_name, last_name, email, phone, cover_letter, cv_path)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [jobId, firstName, lastName, email.toLowerCase(), phone, coverLetter, cvPath]
        );

        const application = await db.get(
            `SELECT a.*, j.title as job_title, j.department
             FROM applications a
             JOIN job_openings j ON a.job_id = j.id
             WHERE a.id = ?`,
            [result.id]
        );

        // Send application confirmation email
        const emailResult = await emailService.sendApplicationConfirmation(
            { first_name: firstName, last_name: lastName, email: email },
            job.title
        );

        res.status(201).json({
            message: 'Application submitted successfully',
            application,
            emailSent: emailResult.success
        });
    } catch (error) {
        console.error('Submit application error:', error);
        res.status(500).json({ error: 'Failed to submit application.' });
    }
});

// PROTECTED ENDPOINTS (Authentication required)

// All routes below require authentication
router.use(authenticate);

// GET /api/recruitment/jobs - Get all job openings
router.get('/jobs', async (req, res) => {
    try {
        const { status = 'active', search = '' } = req.query;
        
        let sql = `
            SELECT j.*, 
                   u.first_name || ' ' || u.last_name as created_by_name,
                   (SELECT COUNT(*) FROM applications WHERE job_id = j.id) as application_count
            FROM job_openings j
            LEFT JOIN users u ON j.created_by = u.id
            WHERE 1=1
        `;
        const params = [];

        if (status && status !== 'all') {
            sql += ' AND j.status = ?';
            params.push(status);
        }

        if (search) {
            sql += ' AND (j.title LIKE ? OR j.department LIKE ?)';
            params.push(`%${search}%`, `%${search}%`);
        }

        sql += ' ORDER BY j.created_at DESC';

        const jobs = await db.all(sql, params);
        res.json({ jobs });
    } catch (error) {
        console.error('Get jobs error:', error);
        res.status(500).json({ error: 'Failed to fetch job openings.' });
    }
});

// GET /api/recruitment/jobs/:id/details - Get single job with applications (admin view)
router.get('/jobs/:id/details', async (req, res) => {
    try {
        const job = await db.get(
            `SELECT j.*, 
                    u.first_name || ' ' || u.last_name as created_by_name,
                    (SELECT COUNT(*) FROM applications WHERE job_id = j.id) as application_count
             FROM job_openings j
             LEFT JOIN users u ON j.created_by = u.id
             WHERE j.id = ?`,
            [req.params.id]
        );

        if (!job) {
            return res.status(404).json({ error: 'Job not found.' });
        }

        // Get applications for this job
        const applications = await db.all(
            `SELECT a.*, 
                    u.first_name || ' ' || u.last_name as reviewed_by_name
             FROM applications a
             LEFT JOIN users u ON a.reviewed_by = u.id
             WHERE a.job_id = ?
             ORDER BY a.applied_at DESC`,
            [req.params.id]
        );

        res.json({ job, applications });
    } catch (error) {
        console.error('Get job error:', error);
        res.status(500).json({ error: 'Failed to fetch job details.' });
    }
});

// POST /api/recruitment/jobs - Create new job (admin/chair only)
router.post('/jobs', requireAdminOrChair, async (req, res) => {
    try {
        const {
            title,
            department,
            location,
            timeCommitment,
            salaryRange,
            description,
            requirements,
            additionalInfo,
            expiryDate
        } = req.body;

        // Validation
        if (!title || !department || !location || !timeCommitment || !description || !requirements || !expiryDate) {
            return res.status(400).json({ error: 'Missing required fields.' });
        }

        const result = await db.run(
            `INSERT INTO job_openings (title, department, location, time_commitment, salary_range,
                                      description, requirements, additional_info, expiry_date, created_by)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [title, department, location, timeCommitment, salaryRange, description, requirements, additionalInfo, expiryDate, req.user.id]
        );

        const job = await db.get('SELECT * FROM job_openings WHERE id = ?', [result.id]);

        res.status(201).json({
            message: 'Job opening created successfully',
            job
        });
    } catch (error) {
        console.error('Create job error:', error);
        res.status(500).json({ error: 'Failed to create job opening.' });
    }
});

// PUT /api/recruitment/jobs/:id - Update job
router.put('/jobs/:id', requireAdminOrChair, async (req, res) => {
    try {
        const {
            title,
            department,
            location,
            timeCommitment,
            salaryRange,
            description,
            requirements,
            additionalInfo,
            expiryDate,
            status
        } = req.body;

        const existingJob = await db.get('SELECT * FROM job_openings WHERE id = ?', [req.params.id]);
        if (!existingJob) {
            return res.status(404).json({ error: 'Job not found.' });
        }

        // Build dynamic update query - only update provided fields
        const updates = [];
        const params = [];
        
        if (title !== undefined) { updates.push('title = ?'); params.push(title); }
        if (department !== undefined) { updates.push('department = ?'); params.push(department); }
        if (location !== undefined) { updates.push('location = ?'); params.push(location); }
        if (timeCommitment !== undefined) { updates.push('time_commitment = ?'); params.push(timeCommitment); }
        if (salaryRange !== undefined) { updates.push('salary_range = ?'); params.push(salaryRange); }
        if (description !== undefined) { updates.push('description = ?'); params.push(description); }
        if (requirements !== undefined) { updates.push('requirements = ?'); params.push(requirements); }
        if (additionalInfo !== undefined) { updates.push('additional_info = ?'); params.push(additionalInfo); }
        if (expiryDate !== undefined) { updates.push('expiry_date = ?'); params.push(expiryDate); }
        if (status !== undefined) { 
            updates.push('status = ?'); 
            params.push(status);
            // If reopening, clear closed_at but warn if expiry_date has passed
            if (status === 'active') {
                updates.push('closed_at = NULL');
                // Check if expiry date has already passed
                const jobToReopen = await db.get('SELECT expiry_date FROM job_openings WHERE id = ?', [req.params.id]);
                if (jobToReopen && new Date(jobToReopen.expiry_date) < new Date()) {
                    // Return a warning in the response but still allow the reopen
                    req._expiryWarning = 'Warning: This job\'s expiry date has already passed. Please update the expiry date so candidates can apply.';
                }
            }
        }
        
        updates.push('updated_at = CURRENT_TIMESTAMP');
        params.push(req.params.id);

        if (updates.length > 1) { // > 1 because updated_at is always included
            console.log('Executing update:', updates.join(', '), 'with params:', params);
            await db.run(
                `UPDATE job_openings SET ${updates.join(', ')} WHERE id = ?`,
                params
            );
        }

        const job = await db.get('SELECT * FROM job_openings WHERE id = ?', [req.params.id]);

        res.json({
            message: 'Job opening updated successfully',
            job,
            warning: req._expiryWarning || null
        });
    } catch (error) {
        console.error('Update job error:', error);
        res.status(500).json({ error: 'Failed to update job opening.' });
    }
});

// POST /api/recruitment/jobs/:id/close - Close job
router.post('/jobs/:id/close', requireAdminOrChair, async (req, res) => {
    try {
        await db.run(
            `UPDATE job_openings 
             SET status = 'closed', closed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
             WHERE id = ?`,
            [req.params.id]
        );

        res.json({ message: 'Job opening closed successfully.' });
    } catch (error) {
        console.error('Close job error:', error);
        res.status(500).json({ error: 'Failed to close job opening.' });
    }
});

// DELETE /api/recruitment/jobs/:id - Delete job
router.delete('/jobs/:id', requireAdminOrChair, async (req, res) => {
    try {
        await db.run('DELETE FROM job_openings WHERE id = ?', [req.params.id]);
        res.json({ message: 'Job opening deleted successfully.' });
    } catch (error) {
        console.error('Delete job error:', error);
        res.status(500).json({ error: 'Failed to delete job opening.' });
    }
});

// === APPLICATIONS ===

// GET /api/recruitment/applications - Get all applications
router.get('/applications', async (req, res) => {
    try {
        const { jobId, status = 'all' } = req.query;

        let sql = `
            SELECT a.*, 
                   j.title as job_title,
                   j.department,
                   u.first_name || ' ' || u.last_name as reviewed_by_name
            FROM applications a
            JOIN job_openings j ON a.job_id = j.id
            LEFT JOIN users u ON a.reviewed_by = u.id
            WHERE 1=1
        `;
        const params = [];

        if (jobId) {
            sql += ' AND a.job_id = ?';
            params.push(jobId);
        }

        if (status && status !== 'all') {
            // Support multiple statuses (comma-separated)
            const statusList = status.split(',').map(s => s.trim()).filter(s => s);
            if (statusList.length === 1) {
                sql += ' AND a.status = ?';
                params.push(statusList[0]);
            } else if (statusList.length > 1) {
                sql += ' AND a.status IN (' + statusList.map(() => '?').join(',') + ')';
                params.push(...statusList);
            }
        }

        sql += ' ORDER BY a.applied_at DESC';

        const applications = await db.all(sql, params);
        res.json({ applications });
    } catch (error) {
        console.error('Get applications error:', error);
        res.status(500).json({ error: 'Failed to fetch applications.' });
    }
});

// PUT /api/recruitment/applications/:id/status - Update application status
router.put('/applications/:id/status', requireAdminOrChair, async (req, res) => {
    try {
        const { status } = req.body;

        if (!['new', 'reviewing', 'shortlisted', 'rejected', 'hired'].includes(status)) {
            return res.status(400).json({ error: 'Invalid status.' });
        }

        // Get application details before updating (for email)
        const application = await db.get(
            `SELECT a.*, j.title as job_title 
             FROM applications a 
             JOIN job_openings j ON a.job_id = j.id 
             WHERE a.id = ?`,
            [req.params.id]
        );

        await db.run(
            `UPDATE applications 
             SET status = ?, reviewed_by = ?, reviewed_at = CURRENT_TIMESTAMP
             WHERE id = ?`,
            [status, req.user.id, req.params.id]
        );

        // If shortlisted, add to shortlisted_candidates table
        if (status === 'shortlisted') {
            await db.run(
                `INSERT OR IGNORE INTO shortlisted_candidates (application_id, shortlisted_by)
                 VALUES (?, ?)`,
                [req.params.id, req.user.id]
            );
        }

        // Send rejection email if status is rejected
        let emailResult = { success: true };
        if (status === 'rejected' && application) {
            emailResult = await emailService.sendRejectionEmail(
                {
                    first_name: application.first_name,
                    last_name: application.last_name,
                    email: application.email
                },
                application.job_title
            );
        }

        res.json({ 
            message: 'Application status updated successfully.',
            emailSent: emailResult.success,
            emailError: emailResult.error || null
        });
    } catch (error) {
        console.error('Update status error:', error);
        res.status(500).json({ error: 'Failed to update application status.' });
    }
});

// === SHORTLISTED CANDIDATES ===

// GET /api/recruitment/shortlisted - Get shortlisted candidates
router.get('/shortlisted', async (req, res) => {
    try {
        const { jobId } = req.query;
        
        let sql = `
            SELECT sc.*, 
                    a.first_name, a.last_name, a.email, a.phone, a.cover_letter,
                    j.id as job_id, j.title as job_title, j.department,
                    u.first_name || ' ' || u.last_name as shortlisted_by_name
             FROM shortlisted_candidates sc
             JOIN applications a ON sc.application_id = a.id
             JOIN job_openings j ON a.job_id = j.id
             LEFT JOIN users u ON sc.shortlisted_by = u.id
             WHERE 1=1
        `;
        const params = [];
        
        if (jobId) {
            sql += ' AND j.id = ?';
            params.push(jobId);
        }
        
        sql += ' ORDER BY sc.shortlisted_at DESC';
        
        const candidates = await db.all(sql, params);
        
        // Get interviewers for each candidate
        for (let candidate of candidates) {
            const interviewers = await db.all(
                `SELECT u.id, u.first_name, u.last_name, u.email, u.avatar
                 FROM shortlisted_interviewers si
                 JOIN users u ON si.user_id = u.id
                 WHERE si.shortlisted_id = ?`,
                [candidate.id]
            );
            candidate.interviewers = interviewers;
        }
        
        res.json({ candidates });
    } catch (error) {
        console.error('Get shortlisted error:', error);
        res.status(500).json({ error: 'Failed to fetch shortlisted candidates.' });
    }
});

// PUT /api/recruitment/shortlisted/:id/interview - Schedule interview
router.put('/shortlisted/:id/interview', requireAdminOrChair, async (req, res) => {
    try {
        const { interviewDate, interviewLocation, interviewType, notes, interviewerIds } = req.body;

        // Get candidate details first for email
        const candidate = await db.get(
            `SELECT sc.*, a.first_name, a.last_name, a.email, j.title as job_title
             FROM shortlisted_candidates sc
             JOIN applications a ON sc.application_id = a.id
             JOIN job_openings j ON a.job_id = j.id
             WHERE sc.id = ?`,
            [req.params.id]
        );

        await db.run(
            `UPDATE shortlisted_candidates 
             SET interview_date = ?, interview_location = ?, interview_type = ?, interview_notes = ?, status = 'interview_scheduled'
             WHERE id = ?`,
            [interviewDate, interviewLocation, interviewType || 'in_person', notes, req.params.id]
        );
        
        // Add interviewers
        if (interviewerIds && interviewerIds.length > 0) {
            // Remove existing interviewers first
            await db.run('DELETE FROM shortlisted_interviewers WHERE shortlisted_id = ?', [req.params.id]);
            
            // Add new interviewers
            for (const userId of interviewerIds) {
                await db.run(
                    'INSERT INTO shortlisted_interviewers (shortlisted_id, user_id) VALUES (?, ?)',
                    [req.params.id, userId]
                );
            }
        }

        // Send interview invitation email
        let emailResult = { success: true };
        if (candidate && candidate.email) {
            emailResult = await emailService.sendInterviewInvitation(
                {
                    first_name: candidate.first_name,
                    last_name: candidate.last_name,
                    email: candidate.email
                },
                {
                    interviewDate,
                    interviewLocation,
                    interviewType: interviewType || 'in_person',
                    jobTitle: candidate.job_title,
                    notes
                }
            );
        }

        res.json({ 
            message: 'Interview scheduled successfully.',
            emailSent: emailResult.success,
            emailError: emailResult.error || null
        });
    } catch (error) {
        console.error('Schedule interview error:', error);
        res.status(500).json({ error: 'Failed to schedule interview.' });
    }
});

// POST /api/recruitment/shortlisted/:id/calendar - Add interview to calendar
router.post('/shortlisted/:id/calendar', requireAdminOrChair, async (req, res) => {
    try {
        const { meetingDate, duration, location, zoomLink } = req.body;
        
        // Get candidate details
        const candidate = await db.get(
            `SELECT sc.*, a.first_name, a.last_name, j.title as job_title
             FROM shortlisted_candidates sc
             JOIN applications a ON sc.application_id = a.id
             JOIN job_openings j ON a.job_id = j.id
             WHERE sc.id = ?`,
            [req.params.id]
        );
        
        if (!candidate) {
            return res.status(404).json({ error: 'Candidate not found.' });
        }
        
        // Create meeting
        const result = await db.run(
            `INSERT INTO meetings (title, meeting_type, meeting_date, duration_minutes, location, zoom_link, agenda, created_by)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                `Interview: ${candidate.first_name} ${candidate.last_name} - ${candidate.job_title}`,
                'interview',
                meetingDate,
                duration || 60,
                location,
                zoomLink,
                `Job Interview for ${candidate.job_title}\n\nCandidate: ${candidate.first_name} ${candidate.last_name}\n\nNotes: ${candidate.interview_notes || 'N/A'}`,
                req.user.id
            ]
        );
        
        // Add interviewers as attendees
        const interviewers = await db.all(
            'SELECT user_id FROM shortlisted_interviewers WHERE shortlisted_id = ?',
            [req.params.id]
        );
        
        for (const interviewer of interviewers) {
            await db.run(
                'INSERT INTO meeting_attendees (meeting_id, user_id, rsvp_status) VALUES (?, ?, ?)',
                [result.id, interviewer.user_id, 'attending']
            );
        }
        
        res.json({ 
            message: 'Interview added to calendar successfully.',
            meetingId: result.id
        });
    } catch (error) {
        console.error('Calendar error:', error);
        res.status(500).json({ error: 'Failed to add interview to calendar.' });
    }
});

// PUT /api/recruitment/shortlisted/:id/score - Update interview score
router.put('/shortlisted/:id/score', requireAdminOrChair, async (req, res) => {
    try {
        const { panelScore, status } = req.body;

        await db.run(
            `UPDATE shortlisted_candidates 
             SET panel_score = ?, status = ?
             WHERE id = ?`,
            [panelScore, status, req.params.id]
        );

        res.json({ message: 'Candidate score updated successfully.' });
    } catch (error) {
        console.error('Update score error:', error);
        res.status(500).json({ error: 'Failed to update candidate score.' });
    }
});

// === SELECTED CANDIDATES ===

// POST /api/recruitment/selected - Add selected candidate
router.post('/selected', requireAdminOrChair, async (req, res) => {
    try {
        const { candidateId, startDate } = req.body;

        // Get candidate details before selecting (for email)
        const candidateInfo = await db.get(
            `SELECT sc.id, a.first_name, a.last_name, a.email, j.title as job_title
             FROM shortlisted_candidates sc
             JOIN applications a ON sc.application_id = a.id
             JOIN job_openings j ON a.job_id = j.id
             WHERE sc.id = ?`,
            [candidateId]
        );

        const result = await db.run(
            `INSERT INTO selected_candidates (candidate_id, selected_by, start_date, offer_sent_at)
             VALUES (?, ?, ?, CURRENT_TIMESTAMP)`,
            [candidateId, req.user.id, startDate]
        );

        // Update application status to hired
        const candidate = await db.get(
            'SELECT application_id FROM shortlisted_candidates WHERE id = ?',
            [candidateId]
        );

        if (candidate) {
            await db.run(
                'UPDATE applications SET status = ? WHERE id = ?',
                ['hired', candidate.application_id]
            );
        }

        const selected = await db.get(
            `SELECT sc.*, a.first_name, a.last_name, a.email, j.title as job_title
             FROM selected_candidates sc
             JOIN shortlisted_candidates src ON sc.candidate_id = src.id
             JOIN applications a ON src.application_id = a.id
             JOIN job_openings j ON a.job_id = j.id
             WHERE sc.id = ?`,
            [result.id]
        );

        // Send selection email
        let emailResult = { success: true };
        if (candidateInfo && candidateInfo.email) {
            emailResult = await emailService.sendSelectionEmail(
                {
                    first_name: candidateInfo.first_name,
                    last_name: candidateInfo.last_name,
                    email: candidateInfo.email
                },
                candidateInfo.job_title,
                startDate
            );
        }

        res.status(201).json({
            message: 'Candidate selected successfully',
            selected,
            emailSent: emailResult.success,
            emailError: emailResult.error || null
        });
    } catch (error) {
        console.error('Select candidate error:', error);
        res.status(500).json({ error: 'Failed to select candidate.' });
    }
});

// GET /api/recruitment/selected - Get selected candidates
router.get('/selected', async (req, res) => {
    try {
        const selected = await db.all(
            `SELECT sc.*, 
                    a.first_name, a.last_name, a.email,
                    j.title as job_title, j.department,
                    u.first_name || ' ' || u.last_name as selected_by_name
             FROM selected_candidates sc
             JOIN shortlisted_candidates src ON sc.candidate_id = src.id
             JOIN applications a ON src.application_id = a.id
             JOIN job_openings j ON a.job_id = j.id
             LEFT JOIN users u ON sc.selected_by = u.id
             ORDER BY sc.selected_at DESC`
        );
        res.json({ selected });
    } catch (error) {
        console.error('Get selected error:', error);
        res.status(500).json({ error: 'Failed to fetch selected candidates.' });
    }
});

// PUT /api/recruitment/selected/:id/offer-accepted - Mark offer accepted
router.put('/selected/:id/offer-accepted', requireAdminOrChair, async (req, res) => {
    try {
        await db.run(
            `UPDATE selected_candidates 
             SET offer_accepted = 1, offer_accepted_at = CURRENT_TIMESTAMP
             WHERE id = ?`,
            [req.params.id]
        );

        res.json({ message: 'Offer acceptance recorded.' });
    } catch (error) {
        console.error('Update offer error:', error);
        res.status(500).json({ error: 'Failed to update offer status.' });
    }
});

// PUT /api/recruitment/selected/:id/onboarding - Update onboarding status
router.put('/selected/:id/onboarding', requireAdminOrChair, async (req, res) => {
    try {
        const { status } = req.body; // 'initiated', 'completed'

        if (status === 'initiated') {
            await db.run(
                'UPDATE selected_candidates SET onboarding_initiated = 1 WHERE id = ?',
                [req.params.id]
            );
        } else if (status === 'completed') {
            await db.run(
                'UPDATE selected_candidates SET onboarding_completed = 1 WHERE id = ?',
                [req.params.id]
            );
        }

        res.json({ message: 'Onboarding status updated.' });
    } catch (error) {
        console.error('Onboarding update error:', error);
        res.status(500).json({ error: 'Failed to update onboarding status.' });
    }
});

module.exports = router;
