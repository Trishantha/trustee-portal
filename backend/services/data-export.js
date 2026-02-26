/**
 * Data Export Service
 * Phase 4: GDPR Compliance - Data Export & Deletion
 */

const db = require('../config/database');
const fs = require('fs').promises;
const path = require('path');

class DataExportService {
    /**
     * Export all data for an organization (GDPR Right to Data Portability)
     */
    async exportOrganizationData(organizationId) {
        try {
            const exportData = {
                export_metadata: {
                    organization_id: organizationId,
                    exported_at: new Date().toISOString(),
                    version: '2.0.0'
                }
            };

            // Get organization details
            exportData.organization = await db.get(
                `SELECT o.*, p.name as plan_name 
                 FROM organizations o
                 LEFT JOIN subscription_plans p ON o.plan_id = p.id
                 WHERE o.id = ?`,
                [organizationId]
            );

            // Get all members
            exportData.members = await db.all(
                `SELECT om.id, om.role, om.department, om.title, om.joined_at, 
                        om.term_start_date, om.term_end_date, om.is_active,
                        u.email, u.first_name, u.last_name, u.phone, u.bio
                 FROM organization_members om
                 JOIN users u ON om.user_id = u.id
                 WHERE om.organization_id = ?`,
                [organizationId]
            );

            // Get committees
            exportData.committees = await db.all(
                `SELECT c.*, 
                        chair.first_name as chair_first_name, chair.last_name as chair_last_name,
                        sec.first_name as secretary_first_name, sec.last_name as secretary_last_name
                 FROM committees c
                 LEFT JOIN organization_members chair_om ON c.chair_id = chair_om.id
                 LEFT JOIN users chair ON chair_om.user_id = chair.id
                 LEFT JOIN organization_members sec_om ON c.secretary_id = sec_om.id
                 LEFT JOIN users sec ON sec_om.user_id = sec.id
                 WHERE c.organization_id = ?`,
                [organizationId]
            );

            // Get committee members
            exportData.committee_members = await db.all(
                `SELECT cm.*, c.name as committee_name, u.first_name, u.last_name, u.email
                 FROM committee_members cm
                 JOIN committees c ON cm.committee_id = c.id
                 JOIN organization_members om ON cm.member_id = om.id
                 JOIN users u ON om.user_id = u.id
                 WHERE c.organization_id = ?`,
                [organizationId]
            );

            // Get meetings
            exportData.meetings = await db.all(
                `SELECT m.*, c.name as committee_name, u.first_name as created_by_first_name, u.last_name as created_by_last_name
                 FROM meetings m
                 LEFT JOIN committees c ON m.committee_id = c.id
                 LEFT JOIN organization_members om ON m.created_by = om.id
                 LEFT JOIN users u ON om.user_id = u.id
                 WHERE m.organization_id = ?`,
                [organizationId]
            );

            // Get meeting attendees
            exportData.meeting_attendees = await db.all(
                `SELECT ma.*, m.title as meeting_title, u.first_name, u.last_name, u.email
                 FROM meeting_attendees ma
                 JOIN meetings m ON ma.meeting_id = m.id
                 JOIN organization_members om ON ma.member_id = om.id
                 JOIN users u ON om.user_id = u.id
                 WHERE m.organization_id = ?`,
                [organizationId]
            );

            // Get tasks
            exportData.tasks = await db.all(
                `SELECT t.*, 
                        assignee_u.first_name as assignee_first_name, assignee_u.last_name as assignee_last_name,
                        assigner_u.first_name as assigner_first_name, assigner_u.last_name as assigner_last_name
                 FROM tasks t
                 JOIN organization_members assignee_om ON t.assigned_to = assignee_om.id
                 JOIN users assignee_u ON assignee_om.user_id = assignee_u.id
                 LEFT JOIN organization_members assigner_om ON t.assigned_by = assigner_om.id
                 LEFT JOIN users assigner_u ON assigner_om.user_id = assigner_u.id
                 WHERE t.organization_id = ?`,
                [organizationId]
            );

            // Get documents
            exportData.documents = await db.all(
                `SELECT d.*, u.first_name as uploaded_by_first_name, u.last_name as uploaded_by_last_name
                 FROM documents d
                 LEFT JOIN organization_members om ON d.uploaded_by = om.id
                 LEFT JOIN users u ON om.user_id = u.id
                 WHERE d.organization_id = ?`,
                [organizationId]
            );

            // Get recruitment data
            exportData.job_openings = await db.all(
                `SELECT jo.*, u.first_name as created_by_first_name, u.last_name as created_by_last_name
                 FROM job_openings jo
                 LEFT JOIN organization_members om ON jo.created_by = om.id
                 LEFT JOIN users u ON om.user_id = u.id
                 WHERE jo.organization_id = ?`,
                [organizationId]
            );

            exportData.applications = await db.all(
                `SELECT a.*, jo.title as job_title
                 FROM applications a
                 JOIN job_openings jo ON a.job_id = jo.id
                 WHERE a.organization_id = ?`,
                [organizationId]
            );

            // Get audit log
            exportData.audit_log = await db.all(
                `SELECT al.*, u.email as user_email
                 FROM audit_log al
                 LEFT JOIN users u ON al.user_id = u.id
                 WHERE al.organization_id = ?
                 ORDER BY al.created_at DESC
                 LIMIT 10000`,
                [organizationId]
            );

            // Get messages/conversations
            exportData.conversations = await db.all(
                `SELECT c.*
                 FROM conversations c
                 WHERE c.organization_id = ?`,
                [organizationId]
            );

            exportData.messages = await db.all(
                `SELECT m.*, u.first_name, u.last_name
                 FROM messages m
                 JOIN conversations c ON m.conversation_id = c.id
                 JOIN organization_members om ON m.sender_member_id = om.id
                 JOIN users u ON om.user_id = u.id
                 WHERE c.organization_id = ?
                 ORDER BY m.sent_at DESC
                 LIMIT 5000`,
                [organizationId]
            );

            // Get notifications
            exportData.notifications = await db.all(
                `SELECT n.*, u.email as user_email
                 FROM notifications n
                 JOIN users u ON n.user_id = u.id
                 WHERE n.organization_id = ?
                 ORDER BY n.created_at DESC
                 LIMIT 5000`,
                [organizationId]
            );

            return exportData;
        } catch (error) {
            console.error('Export organization data error:', error);
            throw error;
        }
    }

    /**
     * Export all data for a specific user (GDPR Right to Access)
     */
    async exportUserData(userId) {
        try {
            const exportData = {
                export_metadata: {
                    user_id: userId,
                    exported_at: new Date().toISOString(),
                    version: '2.0.0'
                }
            };

            // Get user details
            exportData.user = await db.get(
                `SELECT id, email, first_name, last_name, phone, bio, timezone, 
                        language, email_verified, last_login_at, created_at
                 FROM users
                 WHERE id = ?`,
                [userId]
            );

            // Get organization memberships
            exportData.memberships = await db.all(
                `SELECT om.*, o.name as organization_name, o.slug
                 FROM organization_members om
                 JOIN organizations o ON om.organization_id = o.id
                 WHERE om.user_id = ?`,
                [userId]
            );

            // Get tasks assigned to user
            exportData.assigned_tasks = await db.all(
                `SELECT t.*, o.name as organization_name
                 FROM tasks t
                 JOIN organizations o ON t.organization_id = o.id
                 JOIN organization_members om ON t.assigned_to = om.id
                 WHERE om.user_id = ?`,
                [userId]
            );

            // Get tasks created by user
            exportData.created_tasks = await db.all(
                `SELECT t.*, o.name as organization_name
                 FROM tasks t
                 JOIN organizations o ON t.organization_id = o.id
                 JOIN organization_members om ON t.assigned_by = om.id
                 WHERE om.user_id = ?`,
                [userId]
            );

            // Get meeting RSVPs
            exportData.meeting_rsvps = await db.all(
                `SELECT ma.*, m.title as meeting_title, m.meeting_date, o.name as organization_name
                 FROM meeting_attendees ma
                 JOIN meetings m ON ma.meeting_id = m.id
                 JOIN organizations o ON m.organization_id = o.id
                 JOIN organization_members om ON ma.member_id = om.id
                 WHERE om.user_id = ?`,
                [userId]
            );

            // Get messages sent
            exportData.sent_messages = await db.all(
                `SELECT m.*, c.title as conversation_title, o.name as organization_name
                 FROM messages m
                 JOIN conversations c ON m.conversation_id = c.id
                 JOIN organizations o ON c.organization_id = o.id
                 JOIN organization_members om ON m.sender_member_id = om.id
                 WHERE om.user_id = ?
                 ORDER BY m.sent_at DESC
                 LIMIT 1000`,
                [userId]
            );

            // Get notifications
            exportData.notifications = await db.all(
                `SELECT n.*, o.name as organization_name
                 FROM notifications n
                 JOIN organizations o ON n.organization_id = o.id
                 WHERE n.user_id = ?
                 ORDER BY n.created_at DESC
                 LIMIT 1000`,
                [userId]
            );

            // Get audit log entries
            exportData.audit_log = await db.all(
                `SELECT al.*, o.name as organization_name
                 FROM audit_log al
                 JOIN organizations o ON al.organization_id = o.id
                 WHERE al.user_id = ?
                 ORDER BY al.created_at DESC
                 LIMIT 1000`,
                [userId]
            );

            return exportData;
        } catch (error) {
            console.error('Export user data error:', error);
            throw error;
        }
    }

    /**
     * Delete all data for an organization (GDPR Right to Erasure)
     */
    async deleteOrganizationData(organizationId) {
        try {
            // Due to foreign key constraints with ON DELETE CASCADE,
            // deleting the organization will cascade to all related data
            await db.run('DELETE FROM organizations WHERE id = ?', [organizationId]);

            return {
                success: true,
                organization_id: organizationId,
                deleted_at: new Date().toISOString()
            };
        } catch (error) {
            console.error('Delete organization data error:', error);
            throw error;
        }
    }

    /**
     * Anonymize user data (Alternative to deletion for compliance)
     */
    async anonymizeUserData(userId) {
        try {
            const anonymizedEmail = `anonymized_${userId}@deleted.local`;
            const anonymizedName = 'Deleted User';

            await db.run(
                `UPDATE users 
                 SET email = ?,
                     first_name = ?,
                     last_name = ?,
                     phone = NULL,
                     bio = NULL,
                     avatar = NULL,
                     is_active = 0,
                     updated_at = CURRENT_TIMESTAMP
                 WHERE id = ?`,
                [anonymizedEmail, anonymizedName, anonymizedName, userId]
            );

            // Deactivate all memberships
            await db.run(
                `UPDATE organization_members 
                 SET is_active = 0,
                     updated_at = CURRENT_TIMESTAMP
                 WHERE user_id = ?`,
                [userId]
            );

            return {
                success: true,
                user_id: userId,
                anonymized_at: new Date().toISOString()
            };
        } catch (error) {
            console.error('Anonymize user data error:', error);
            throw error;
        }
    }

    /**
     * Generate export file and save to disk
     */
    async generateExportFile(organizationId, format = 'json') {
        try {
            const data = await this.exportOrganizationData(organizationId);
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const filename = `export_org_${organizationId}_${timestamp}`;

            let filePath;
            let contentType;

            if (format === 'json') {
                filePath = path.join(__dirname, '../exports', `${filename}.json`);
                await fs.mkdir(path.dirname(filePath), { recursive: true });
                await fs.writeFile(filePath, JSON.stringify(data, null, 2));
                contentType = 'application/json';
            } else if (format === 'csv') {
                // For CSV, create a zip with multiple CSV files
                filePath = await this.generateCSVExport(data, filename);
                contentType = 'application/zip';
            }

            return {
                filePath,
                filename: path.basename(filePath),
                contentType,
                size: (await fs.stat(filePath)).size
            };
        } catch (error) {
            console.error('Generate export file error:', error);
            throw error;
        }
    }

    /**
     * Generate CSV export (multiple files in zip)
     */
    async generateCSVExport(data, filename) {
        // This would convert JSON data to CSV format
        // For simplicity, we'll just return the JSON for now
        // In production, you'd use a library like json2csv
        const filePath = path.join(__dirname, '../exports', `${filename}.zip`);
        await fs.mkdir(path.dirname(filePath), { recursive: true });
        
        // Placeholder - would create actual CSV files
        return filePath;
    }
}

module.exports = new DataExportService();
