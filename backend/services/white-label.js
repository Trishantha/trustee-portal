/**
 * White-Label Service
 * Phase 7: White-Label Features & Customization
 */

const db = require('../config/database');
const fs = require('fs').promises;
const path = require('path');

class WhiteLabelService {
    /**
     * Get white-label configuration for an organization
     */
    async getConfig(organizationId) {
        try {
            const organization = await db.get(
                `SELECT id, name, slug, custom_domain, logo_url, favicon_url,
                        primary_color, secondary_color, website_url, description
                 FROM organizations
                 WHERE id = ?`,
                [organizationId]
            );

            if (!organization) {
                return null;
            }

            // Get custom settings from settings JSON
            const settings = await db.get(
                'SELECT settings FROM organizations WHERE id = ?',
                [organizationId]
            );

            const parsedSettings = settings?.settings ? JSON.parse(settings.settings) : {};

            return {
                organization: {
                    id: organization.id,
                    name: organization.name,
                    slug: organization.slug,
                    custom_domain: organization.custom_domain,
                    website_url: organization.website_url,
                    description: organization.description
                },
                branding: {
                    logo_url: organization.logo_url,
                    favicon_url: organization.favicon_url,
                    primary_color: organization.primary_color || '#4f46e5',
                    secondary_color: organization.secondary_color || '#7c3aed'
                },
                customization: {
                    timezone: parsedSettings.timezone || 'UTC',
                    date_format: parsedSettings.date_format || 'YYYY-MM-DD',
                    time_format: parsedSettings.time_format || '24h',
                    language: parsedSettings.language || 'en'
                }
            };
        } catch (error) {
            console.error('Get white-label config error:', error);
            return null;
        }
    }

    /**
     * Update white-label configuration
     */
    async updateConfig(organizationId, updates) {
        try {
            const {
                logo_url,
                favicon_url,
                primary_color,
                secondary_color,
                custom_domain,
                timezone,
                date_format,
                time_format,
                language
            } = updates;

            // Update organization table
            const orgUpdates = [];
            const orgValues = [];

            if (logo_url !== undefined) {
                orgUpdates.push('logo_url = ?');
                orgValues.push(logo_url);
            }
            if (favicon_url !== undefined) {
                orgUpdates.push('favicon_url = ?');
                orgValues.push(favicon_url);
            }
            if (primary_color !== undefined) {
                orgUpdates.push('primary_color = ?');
                orgValues.push(primary_color);
            }
            if (secondary_color !== undefined) {
                orgUpdates.push('secondary_color = ?');
                orgValues.push(secondary_color);
            }
            if (custom_domain !== undefined) {
                orgUpdates.push('custom_domain = ?');
                orgValues.push(custom_domain);
            }

            if (orgUpdates.length > 0) {
                orgUpdates.push('updated_at = CURRENT_TIMESTAMP');
                orgValues.push(organizationId);

                await db.run(
                    `UPDATE organizations SET ${orgUpdates.join(', ')} WHERE id = ?`,
                    orgValues
                );
            }

            // Update settings JSON
            if (timezone || date_format || time_format || language) {
                const currentSettings = await db.get(
                    'SELECT settings FROM organizations WHERE id = ?',
                    [organizationId]
                );

                const settings = currentSettings?.settings ? 
                    JSON.parse(currentSettings.settings) : {};

                if (timezone) settings.timezone = timezone;
                if (date_format) settings.date_format = date_format;
                if (time_format) settings.time_format = time_format;
                if (language) settings.language = language;

                await db.run(
                    'UPDATE organizations SET settings = ? WHERE id = ?',
                    [JSON.stringify(settings), organizationId]
                );
            }

            return await this.getConfig(organizationId);
        } catch (error) {
            console.error('Update white-label config error:', error);
            throw error;
        }
    }

    /**
     * Generate custom CSS for white-label
     */
    async generateCustomCSS(organizationId) {
        try {
            const config = await this.getConfig(organizationId);
            
            if (!config) {
                return null;
            }

            const { primary_color, secondary_color } = config.branding;

            const css = `
/* White-Label Custom CSS for ${config.organization.name} */
:root {
    --primary: ${primary_color};
    --secondary: ${secondary_color};
    --primary-light: ${this.adjustColor(primary_color, 20)};
    --primary-dark: ${this.adjustColor(primary_color, -20)};
}

.logo-container img {
    max-height: 40px;
}

.custom-branding {
    --brand-primary: ${primary_color};
    --brand-secondary: ${secondary_color};
}
`;

            return css;
        } catch (error) {
            console.error('Generate custom CSS error:', error);
            return null;
        }
    }

    /**
     * Get white-label login page configuration
     */
    async getLoginConfig(slug) {
        try {
            const organization = await db.get(
                `SELECT id, name, slug, logo_url, favicon_url,
                        primary_color, secondary_color, description
                 FROM organizations
                 WHERE slug = ? OR custom_domain = ?`,
                [slug, slug]
            );

            if (!organization) {
                return null;
            }

            return {
                organization: {
                    name: organization.name,
                    slug: organization.slug,
                    description: organization.description
                },
                branding: {
                    logo_url: organization.logo_url,
                    favicon_url: organization.favicon_url,
                    primary_color: organization.primary_color || '#4f46e5',
                    secondary_color: organization.secondary_color || '#7c3aed'
                }
            };
        } catch (error) {
            console.error('Get login config error:', error);
            return null;
        }
    }

    /**
     * Validate custom domain
     */
    async validateCustomDomain(domain, organizationId) {
        try {
            // Check if domain is already used by another organization
            const existing = await db.get(
                'SELECT id FROM organizations WHERE custom_domain = ? AND id != ?',
                [domain, organizationId]
            );

            if (existing) {
                return {
                    valid: false,
                    error: 'Domain is already in use by another organization'
                };
            }

            // Basic domain validation
            const domainRegex = /^[a-zA-Z0-9][a-zA-Z0-9-]{1,61}[a-zA-Z0-9]\.[a-zA-Z]{2,}$/;
            if (!domainRegex.test(domain)) {
                return {
                    valid: false,
                    error: 'Invalid domain format'
                };
            }

            return {
                valid: true,
                message: 'Domain is available'
            };
        } catch (error) {
            console.error('Validate custom domain error:', error);
            return {
                valid: false,
                error: 'Error validating domain'
            };
        }
    }

    /**
     * Get email template with white-label branding
     */
    async getEmailTemplate(organizationId, templateType) {
        try {
            const config = await this.getConfig(organizationId);
            
            if (!config) {
                return null;
            }

            const baseTemplate = {
                header_color: config.branding.primary_color,
                logo_url: config.branding.logo_url,
                organization_name: config.organization.name
            };

            switch (templateType) {
                case 'welcome':
                    return {
                        ...baseTemplate,
                        subject: `Welcome to ${config.organization.name}`,
                        preheader: 'Get started with your new trustee portal'
                    };
                case 'invitation':
                    return {
                        ...baseTemplate,
                        subject: `You've been invited to join ${config.organization.name}`,
                        preheader: 'Accept your invitation to get started'
                    };
                default:
                    return baseTemplate;
            }
        } catch (error) {
            console.error('Get email template error:', error);
            return null;
        }
    }

    /**
     * Helper: Adjust color brightness
     */
    adjustColor(color, percent) {
        const num = parseInt(color.replace('#', ''), 16);
        const amt = Math.round(2.55 * percent);
        const R = (num >> 16) + amt;
        const G = (num >> 8 & 0x00FF) + amt;
        const B = (num & 0x0000FF) + amt;
        return '#' + (
            0x1000000 +
            (R < 255 ? (R < 1 ? 0 : R) : 255) * 0x10000 +
            (G < 255 ? (G < 1 ? 0 : G) : 255) * 0x100 +
            (B < 255 ? (B < 1 ? 0 : B) : 255)
        ).toString(16).slice(1);
    }

    /**
     * Get all white-label settings for platform admin
     */
    async getPlatformWhiteLabelStats() {
        try {
            const stats = await db.all(`
                SELECT 
                    CASE 
                        WHEN custom_domain IS NOT NULL THEN 'custom_domain'
                        WHEN logo_url IS NOT NULL THEN 'branded'
                        ELSE 'default'
                    END as branding_type,
                    COUNT(*) as count
                FROM organizations
                GROUP BY branding_type
            `);

            const customDomains = await db.all(`
                SELECT id, name, slug, custom_domain, logo_url
                FROM organizations
                WHERE custom_domain IS NOT NULL
                ORDER BY name
            `);

            return {
                branding_distribution: stats,
                custom_domains: customDomains
            };
        } catch (error) {
            console.error('Get white-label stats error:', error);
            return null;
        }
    }
}

module.exports = new WhiteLabelService();
