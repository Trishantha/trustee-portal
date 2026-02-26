/**
 * Platform Admin Module (Super Admin Only)
 * Enhanced with Analytics, Revenue, Health, and White-Label features
 */

// ==================== TAB NAVIGATION ====================

function switchPlatformTab(tab) {
    currentPlatformTab = tab;
    
    // Update tab buttons
    document.querySelectorAll('.platform-tabs .tab-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.tab === tab);
    });
    
    // Update tab content
    document.querySelectorAll('.tab-content').forEach(content => {
        content.classList.remove('active');
    });
    const tabEl = document.getElementById(tab + 'Tab');
    if (tabEl) tabEl.classList.add('active');
    
    // Load content for the tab
    switch(tab) {
        case 'clients': loadOrganizations(); break;
        case 'analytics': loadPlatformStats(); loadDashboardSummary(); loadGrowthMetrics(); break;
        case 'revenue': loadRevenueAnalytics(); break;
        case 'health': loadOrganizationHealth(); loadUsageWarnings(); break;
        case 'plans': loadPlans(); break;
        case 'whitelabel': loadWhiteLabelStats(); break;
        case 'activity': loadPlatformActivity(); break;
    }
}

// ==================== PLATFORM STATS ====================

async function loadPlatformStats() {
    try {
        const stats = await api.get('/platform/stats');
        
        const totalEl = document.getElementById('totalOrganizations');
        const activeEl = document.getElementById('activeSubscriptions');
        const trialEl = document.getElementById('trialOrganizations');
        const revenueEl = document.getElementById('monthlyRevenue');
        
        if (totalEl) totalEl.textContent = stats.totalOrganizations || 0;
        if (activeEl) activeEl.textContent = stats.activeSubscriptions || 0;
        if (trialEl) trialEl.textContent = stats.trialOrganizations || 0;
        if (revenueEl) revenueEl.textContent = formatCurrency(stats.monthlyRevenue || 0);
        
        // Update service indicators
        updateServiceIndicators();
    } catch (error) {
        console.error('Failed to load platform stats:', error);
    }
}

async function updateServiceIndicators() {
    try {
        const health = await api.get('/health');
        
        const emailIndicator = document.getElementById('emailStatusIndicator');
        const stripeIndicator = document.getElementById('stripeStatusIndicator');
        
        if (emailIndicator) {
            emailIndicator.style.background = health.email?.configured ? '#22c55e' : '#ef4444';
            emailIndicator.classList.toggle('active', health.email?.configured);
        }
        if (stripeIndicator) {
            stripeIndicator.style.background = health.stripe?.configured ? '#22c55e' : '#ef4444';
            stripeIndicator.classList.toggle('active', health.stripe?.configured);
        }
    } catch (error) {
        console.error('Failed to update service indicators:', error);
    }
}

// ==================== DASHBOARD SUMMARY ====================

async function loadDashboardSummary() {
    try {
        const summary = await api.get('/platform/analytics/dashboard');
        
        // Update analytics cards
        const totalUsersEl = document.getElementById('analyticsTotalUsers');
        const churnRateEl = document.getElementById('analyticsChurnRate');
        const conversionEl = document.getElementById('analyticsConversionRate');
        const netGrowthEl = document.getElementById('analyticsNetGrowth');
        
        if (totalUsersEl) totalUsersEl.textContent = (summary.totals?.total_users || 0).toLocaleString();
        if (churnRateEl) churnRateEl.textContent = (summary.churn?.churn_rate_percent || 0).toFixed(1) + '%';
        if (conversionEl) conversionEl.textContent = (summary.growth?.trial_conversion?.rate_percent || 0).toFixed(1) + '%';
        if (netGrowthEl) {
            const growth = summary.growth?.net_growth || 0;
            netGrowthEl.textContent = (growth > 0 ? '+' : '') + growth;
            netGrowthEl.style.color = growth >= 0 ? 'var(--success)' : 'var(--danger)';
        }
    } catch (error) {
        console.error('Failed to load dashboard summary:', error);
    }
}

// ==================== REVENUE ANALYTICS ====================

async function loadRevenueAnalytics() {
    try {
        const revenue = await api.get('/platform/analytics/revenue');
        
        // Update revenue cards
        const mrrEl = document.getElementById('revenueMRR');
        const arrEl = document.getElementById('revenueARR');
        const churnEl = document.getElementById('revenueChurn');
        
        if (mrrEl) mrrEl.textContent = formatCurrency(revenue.total_mrr || 0);
        if (arrEl) arrEl.textContent = formatCurrency(revenue.estimated_arr || 0);
        if (churnEl) churnEl.textContent = formatCurrency(revenue.revenue_churn || 0);
        
        // Revenue by plan
        const byPlanContainer = document.getElementById('revenueByPlan');
        if (byPlanContainer && revenue.by_plan) {
            byPlanContainer.innerHTML = revenue.by_plan.map(plan => `
                <div style="display: flex; justify-content: space-between; align-items: center; padding: 1rem; border-bottom: 1px solid var(--border);">
                    <div>
                        <strong>${plan.plan_name}</strong>
                        <div style="font-size: 0.85rem; color: var(--text-light);">${plan.organization_count} organizations</div>
                    </div>
                    <div style="text-align: right;">
                        <div style="font-weight: 600; color: var(--success);">${formatCurrency(plan.monthly_revenue || 0)}/mo</div>
                        <div style="font-size: 0.85rem; color: var(--text-light);">avg ${formatCurrency(plan.avg_revenue_per_org || 0)}/mo</div>
                    </div>
                </div>
            `).join('');
        }
        
        // Monthly breakdown
        const monthlyContainer = document.getElementById('monthlyRevenueList');
        if (monthlyContainer && revenue.monthly_breakdown) {
            monthlyContainer.innerHTML = revenue.monthly_breakdown.map(m => `
                <div style="display: flex; justify-content: space-between; padding: 0.75rem 1rem; border-bottom: 1px solid var(--border);">
                    <span>${m.month}</span>
                    <span style="font-weight: 600;">${formatCurrency(m.monthly_recurring_revenue || 0)}</span>
                </div>
            `).join('');
        }
    } catch (error) {
        console.error('Failed to load revenue analytics:', error);
    }
}

// ==================== GROWTH METRICS ====================

async function loadGrowthMetrics() {
    try {
        const period = document.getElementById('growthPeriod')?.value || 30;
        const growth = await api.get(`/platform/analytics/growth?days=${period}`);
        
        // Growth chart (simple HTML representation)
        const chartContainer = document.getElementById('growthChart');
        if (chartContainer && growth.daily_signups) {
            const maxSignups = Math.max(...growth.daily_signups.map(d => d.new_organizations), 1);
            
            chartContainer.innerHTML = `
                <div style="display: flex; align-items: flex-end; gap: 2px; height: 250px; padding: 1rem 0;">
                    ${growth.daily_signups.map(day => {
                        const height = (day.new_organizations / maxSignups) * 100;
                        return `
                            <div style="flex: 1; display: flex; flex-direction: column; align-items: center; gap: 4px;">
                                <div style="width: 100%; height: ${Math.max(height, 2)}%; background: linear-gradient(to top, var(--primary), var(--secondary)); border-radius: 2px; min-height: 2px;" title="${day.date}: ${day.new_organizations} signups"></div>
                            </div>
                        `;
                    }).join('')}
                </div>
                <div style="display: flex; justify-content: space-between; margin-top: 0.5rem; font-size: 0.75rem; color: var(--text-light);">
                    <span>${growth.daily_signups[0]?.date}</span>
                    <span>${growth.daily_signups[growth.daily_signups.length - 1]?.date}</span>
                </div>
                <div style="text-align: center; margin-top: 1rem;">
                    <strong>Total New: ${growth.total_new_organizations}</strong> | 
                    <span style="color: var(--danger);">Cancelled: ${growth.total_cancellations}</span> | 
                    <span style="color: ${growth.net_growth >= 0 ? 'var(--success)' : 'var(--danger)'};">Net: ${growth.net_growth > 0 ? '+' : ''}${growth.net_growth}</span>
                </div>
            `;
        }
        
        // Signups by plan
        const signupsContainer = document.getElementById('signupsByPlan');
        if (signupsContainer && growth.signups_by_plan) {
            signupsContainer.innerHTML = growth.signups_by_plan.map(plan => `
                <div style="display: flex; justify-content: space-between; padding: 0.75rem 0; border-bottom: 1px solid var(--border);">
                    <span>${plan.plan_name}</span>
                    <span class="badge badge-primary">${plan.signups}</span>
                </div>
            `).join('');
        }
    } catch (error) {
        console.error('Failed to load growth metrics:', error);
    }
}

// ==================== ORGANIZATION HEALTH ====================

async function loadOrganizationHealth() {
    try {
        const health = await api.get('/platform/analytics/health');
        
        // Update health cards
        const atRiskEl = document.getElementById('healthAtRisk');
        const pastDueEl = document.getElementById('healthPastDue');
        const inactiveEl = document.getElementById('healthInactive');
        const activeEl = document.getElementById('healthActive');
        
        if (atRiskEl) atRiskEl.textContent = health.at_risk_count || 0;
        if (pastDueEl) pastDueEl.textContent = health.past_due_count || 0;
        if (inactiveEl) inactiveEl.textContent = health.inactive_organizations?.length || 0;
        if (activeEl) activeEl.textContent = health.most_active?.length || 0;
        
        // Update health badge
        const healthBadge = document.getElementById('healthBadge');
        if (healthBadge) {
            const totalIssues = (health.at_risk_count || 0) + (health.past_due_count || 0);
            healthBadge.textContent = totalIssues;
            healthBadge.style.display = totalIssues > 0 ? 'inline-block' : 'none';
        }
        
        // Trials expiring
        const trialsContainer = document.getElementById('trialsExpiring');
        if (trialsContainer && health.at_risk_organizations) {
            if (health.at_risk_organizations.length === 0) {
                trialsContainer.innerHTML = `<div class="empty-state"><i class="fas fa-check-circle"></i><p>No trials expiring soon</p></div>`;
            } else {
                trialsContainer.innerHTML = health.at_risk_organizations.map(org => {
                    const daysLeft = Math.ceil((new Date(org.trial_ends_at) - new Date()) / (1000 * 60 * 60 * 24));
                    return `
                        <div style="display: flex; justify-content: space-between; align-items: center; padding: 0.75rem; border-bottom: 1px solid var(--border);">
                            <div>
                                <strong>${org.name}</strong>
                                <div style="font-size: 0.8rem; color: var(--text-light);">${org.plan_name}</div>
                            </div>
                            <span class="badge badge-warning">${daysLeft} days left</span>
                        </div>
                    `;
                }).join('');
            }
        }
        
        // Load churn data for cancellations
        await loadRecentCancellations();
        
    } catch (error) {
        console.error('Failed to load organization health:', error);
    }
}

async function loadRecentCancellations() {
    try {
        const churn = await api.get('/platform/analytics/churn?days=30');
        
        const container = document.getElementById('recentCancellations');
        if (container && churn.cancellations) {
            if (churn.cancellations.length === 0) {
                container.innerHTML = `<div class="empty-state"><i class="fas fa-check-circle"></i><p>No recent cancellations</p></div>`;
            } else {
                container.innerHTML = churn.cancellations.slice(0, 10).map(org => `
                    <div style="padding: 0.75rem; border-bottom: 1px solid var(--border);">
                        <div style="display: flex; justify-content: space-between;">
                            <strong>${org.name}</strong>
                            <span style="font-size: 0.8rem; color: var(--text-light);">${new Date(org.cancellation_date).toLocaleDateString()}</span>
                        </div>
                        <div style="font-size: 0.8rem; color: var(--text-light);">
                            ${org.plan_name} • ${Math.round(org.lifetime_days)} days
                        </div>
                    </div>
                `).join('');
            }
        }
    } catch (error) {
        console.error('Failed to load cancellations:', error);
    }
}

// ==================== USAGE WARNINGS ====================

async function loadUsageWarnings() {
    try {
        const warnings = await api.get('/usage/warnings');
        
        const container = document.getElementById('usageWarnings');
        if (container && warnings.warnings) {
            if (warnings.warnings.length === 0) {
                container.innerHTML = `<div class="empty-state"><i class="fas fa-check-circle"></i><p>No organizations near limits</p></div>`;
            } else {
                container.innerHTML = `
                    <div class="client-list-header">
                        <div>Organization</div>
                        <div>Resource</div>
                        <div>Usage</div>
                        <div>Actions</div>
                    </div>
                    ${warnings.warnings.map(w => `
                        <div class="client-item" style="background: ${w.percentage >= 95 ? '#fef2f2' : '#fffbeb'};">
                            <div class="client-info">
                                <span class="client-name">${w.organization_name}</span>
                            </div>
                            <div>
                                <span class="badge badge-warning">${w.resource}</span>
                            </div>
                            <div>
                                <div style="font-weight: 600; color: ${w.percentage >= 95 ? 'var(--danger)' : 'var(--warning)'};">
                                    ${w.current} / ${w.limit} (${w.percentage}%)
                                </div>
                                <div style="width: 100%; height: 4px; background: #e5e7eb; border-radius: 2px; margin-top: 4px;">
                                    <div style="width: ${w.percentage}%; height: 100%; background: ${w.percentage >= 95 ? 'var(--danger)' : 'var(--warning)'}; border-radius: 2px;"></div>
                                </div>
                            </div>
                            <div>
                                <button class="btn btn-sm btn-primary" onclick="alert('Contact ${w.organization_name} about upgrading')">
                                    Contact
                                </button>
                            </div>
                        </div>
                    `).join('')}
                `;
            }
        }
    } catch (error) {
        console.error('Failed to load usage warnings:', error);
    }
}

// ==================== WHITE-LABEL STATS ====================

async function loadWhiteLabelStats() {
    try {
        const stats = await api.get('/white-label/platform-stats');
        
        // Calculate totals
        const totalCustom = stats.branding_distribution?.find(b => b.branding_type === 'branded')?.count || 0;
        const totalDomains = stats.branding_distribution?.find(b => b.branding_type === 'custom_domain')?.count || 0;
        const totalDefault = stats.branding_distribution?.find(b => b.branding_type === 'default')?.count || 0;
        
        const customEl = document.getElementById('wlTotalCustom');
        const domainsEl = document.getElementById('wlCustomDomains');
        const defaultEl = document.getElementById('wlDefault');
        
        if (customEl) customEl.textContent = totalCustom + totalDomains;
        if (domainsEl) domainsEl.textContent = totalDomains;
        if (defaultEl) defaultEl.textContent = totalDefault;
        
        // Custom domains list
        const container = document.getElementById('customDomainsList');
        if (container && stats.custom_domains) {
            if (stats.custom_domains.length === 0) {
                container.innerHTML = `<div class="empty-state"><i class="fas fa-globe"></i><p>No custom domains configured</p></div>`;
            } else {
                container.innerHTML = `
                    <div class="client-list-header">
                        <div>Organization</div>
                        <div>Custom Domain</div>
                        <div>Logo</div>
                        <div>Actions</div>
                    </div>
                    ${stats.custom_domains.map(org => `
                        <div class="client-item">
                            <div class="client-info">
                                <span class="client-name">${org.name}</span>
                                <span class="client-slug">${org.slug}</span>
                            </div>
                            <div>
                                <a href="https://${org.custom_domain}" target="_blank" style="color: var(--primary);">
                                    ${org.custom_domain} <i class="fas fa-external-link-alt" style="font-size: 0.75rem;"></i>
                                </a>
                            </div>
                            <div>
                                ${org.logo_url ? '<span class="badge badge-success"><i class="fas fa-check"></i> Custom</span>' : '<span class="badge badge-secondary">Default</span>'}
                            </div>
                            <div class="client-actions">
                                <button class="btn btn-sm btn-secondary" onclick="viewOrganization(${org.id})">
                                    <i class="fas fa-eye"></i>
                                </button>
                            </div>
                        </div>
                    `).join('')}
                `;
            }
        }
    } catch (error) {
        console.error('Failed to load white-label stats:', error);
    }
}

// ==================== CLIENT LIST ====================

let allOrganizations = [];

async function loadOrganizations() {
    try {
        const container = document.getElementById('clientList');
        if (container) {
            container.innerHTML = `
                <div class="loading-state">
                    <i class="fas fa-spinner fa-spin"></i>
                    <p>Loading clients...</p>
                </div>
            `;
        }
        
        const statusFilter = document.getElementById('orgStatusFilter')?.value || '';
        let url = '/platform/organizations';
        const params = new URLSearchParams();
        if (statusFilter) params.append('status', statusFilter);
        params.append('_t', Date.now()); // Cache buster
        url += '?' + params.toString();
        
        const result = await api.get(url);
        allOrganizations = result.organizations || [];
        
        displayClients(allOrganizations);
    } catch (error) {
        console.error('Failed to load organizations:', error);
        const container = document.getElementById('clientList');
        if (container) {
            container.innerHTML = `<div class="empty-state"><i class="fas fa-exclamation-circle"></i><p>Failed to load organizations</p></div>`;
        }
    }
}

function displayClients(organizations) {
    const container = document.getElementById('clientList');
    const noMsg = document.getElementById('noClientsMsg');
    
    if (!container) return;
    
    // Apply search filter
    const searchTerm = document.getElementById('clientSearch')?.value.toLowerCase() || '';
    let filtered = organizations;
    if (searchTerm) {
        filtered = organizations.filter(org => 
            org.client_id?.toLowerCase().includes(searchTerm.replace(/[^a-z0-9]/g, '')) ||
            org.client_id_formatted?.toLowerCase().includes(searchTerm) ||
            org.id?.toString().includes(searchTerm) ||
            org.name?.toLowerCase().includes(searchTerm) ||
            org.slug?.toLowerCase().includes(searchTerm) ||
            org.billing_email?.toLowerCase().includes(searchTerm) ||
            org.admin_name?.toLowerCase().includes(searchTerm) ||
            org.admin_email?.toLowerCase().includes(searchTerm)
        );
    }
    
    if (filtered.length === 0) {
        container.innerHTML = '';
        if (noMsg) noMsg.style.display = 'block';
        return;
    }
    
    if (noMsg) noMsg.style.display = 'none';
    
    // Build table with all columns
    let tableHTML = `
        <div style="overflow-x: auto;">
            <table style="width: 100%; border-collapse: collapse; font-size: 0.8rem;">
                <thead>
                    <tr style="background: var(--bg-light); border-bottom: 2px solid var(--border);">
                        <th style="padding: 0.5rem; text-align: left; font-weight: 600; white-space: nowrap;">Client ID</th>
                        <th style="padding: 0.5rem; text-align: left; font-weight: 600; white-space: nowrap;">Organization</th>
                        <th style="padding: 0.5rem; text-align: left; font-weight: 600; white-space: nowrap;">Admin User</th>
                        <th style="padding: 0.5rem; text-align: left; font-weight: 600; white-space: nowrap;">Admin Email</th>
                        <th style="padding: 0.5rem; text-align: left; font-weight: 600; white-space: nowrap;">Plan</th>
                        <th style="padding: 0.5rem; text-align: left; font-weight: 600; white-space: nowrap;">Payment Mode</th>
                        <th style="padding: 0.5rem; text-align: left; font-weight: 600; white-space: nowrap;">Payment Method</th>
                        <th style="padding: 0.5rem; text-align: left; font-weight: 600; white-space: nowrap;">First Registration</th>
                        <th style="padding: 0.5rem; text-align: left; font-weight: 600; white-space: nowrap;">Next Renewal</th>
                        <th style="padding: 0.5rem; text-align: left; font-weight: 600; white-space: nowrap;">Last Payment</th>
                        <th style="padding: 0.5rem; text-align: left; font-weight: 600; white-space: nowrap;">Status</th>
                        <th style="padding: 0.5rem; text-align: center; font-weight: 600; white-space: nowrap;">Actions</th>
                    </tr>
                </thead>
                <tbody>
    `;
    
    filtered.forEach(org => {
        const status = org.subscription_status || 'trial';
        const statusClass = `status-${status}`;
        const statusLabel = status.replace('_', ' ').toUpperCase();
        
        const billingCycle = org.billing_cycle || 'monthly';
        const paymentMethod = org.payment_method || 'Not Set';
        const createdDate = org.created_at ? new Date(org.created_at).toLocaleDateString() : 'N/A';
        const renewalDate = org.current_period_end ? new Date(org.current_period_end).toLocaleDateString() : 'N/A';
        const lastPayment = org.last_payment_date ? new Date(org.last_payment_date).toLocaleDateString() : 'N/A';
        
        // Format client ID for display (ABC-DEF-GHI-JKL)
        const clientIdDisplay = org.client_id_formatted || (org.client_id ? org.client_id.match(/.{1,3}/g).join('-') : 'N/A');
        
        tableHTML += `
            <tr style="border-bottom: 1px solid var(--border);" onmouseover="this.style.background='var(--bg-light)'" onmouseout="this.style.background='transparent'">
                <td style="padding: 0.5rem; font-family: monospace; font-weight: 600; color: var(--primary);">
                    <span style="background: var(--bg-light); padding: 0.25rem 0.5rem; border-radius: 4px; font-size: 0.85rem; letter-spacing: 0.5px;">${clientIdDisplay}</span>
                </td>
                <td style="padding: 0.5rem;">${org.name || 'Unknown'}</td>
                <td style="padding: 0.5rem;">${org.admin_name || 'N/A'}</td>
                <td style="padding: 0.5rem; font-size: 0.75rem;">${org.admin_email || 'N/A'}</td>
                <td style="padding: 0.5rem;">${org.plan_name || 'Unknown'}</td>
                <td style="padding: 0.5rem;"><span class="badge badge-secondary" style="font-size: 0.7rem;">${billingCycle.toUpperCase()}</span></td>
                <td style="padding: 0.5rem; font-size: 0.75rem;">${paymentMethod}</td>
                <td style="padding: 0.5rem; white-space: nowrap;">${createdDate}</td>
                <td style="padding: 0.5rem; white-space: nowrap;">${renewalDate}</td>
                <td style="padding: 0.5rem; white-space: nowrap;">${lastPayment}</td>
                <td style="padding: 0.5rem;"><span class="badge ${statusClass}" style="font-size: 0.7rem;">${statusLabel}</span></td>
                <td style="padding: 0.5rem; text-align: center;">
                    <div style="display: flex; gap: 2px; justify-content: center;">
                        <button class="btn btn-xs btn-secondary" onclick="viewOrganization(${org.id})" title="View" style="padding: 2px 5px; font-size: 0.7rem;">
                            <i class="fas fa-eye"></i>
                        </button>
                        <button class="btn btn-xs btn-info" onclick="openChangePlanModal(${org.id})" title="Change Plan" style="padding: 2px 5px; font-size: 0.7rem;">
                            <i class="fas fa-exchange-alt"></i>
                        </button>
                        <button class="btn btn-xs btn-primary" onclick="renewOrganization(${org.id})" title="Renew" style="padding: 2px 5px; font-size: 0.7rem;">
                            <i class="fas fa-sync"></i>
                        </button>
                        ${status === 'suspended' ? `
                            <button class="btn btn-xs btn-success" onclick="activateOrganization(${org.id})" title="Activate" style="padding: 2px 5px; font-size: 0.7rem;">
                                <i class="fas fa-play"></i>
                            </button>
                        ` : `
                            <button class="btn btn-xs btn-warning" onclick="suspendOrganization(${org.id})" title="Suspend" style="padding: 2px 5px; font-size: 0.7rem;">
                                <i class="fas fa-pause"></i>
                            </button>
                        `}
                    </div>
                </td>
            </tr>
        `;
    });
    
    tableHTML += '</tbody></table></div>';
    container.innerHTML = tableHTML;
}

function filterClients() {
    displayClients(allOrganizations);
}

// ==================== CLIENT ACTIONS ====================

function viewOrganization(orgId) {
    const org = allOrganizations.find(o => o.id === orgId);
    if (!org) return;
    
    const content = document.getElementById('viewOrgContent');
    if (!content) return;
    
    const status = org.subscription_status || 'trial';
    const clientIdFormatted = org.client_id_formatted || (org.client_id ? org.client_id.match(/.{1,3}/g).join('-') : 'N/A');
    
    content.innerHTML = `
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1.5rem; margin-bottom: 1.5rem;">
            <div>
                <h4 style="color: var(--primary); margin-bottom: 0.5rem;">Organization Info</h4>
                <p><strong>Client ID:</strong> <span style="font-family: monospace; font-weight: 600; color: var(--primary); background: var(--bg-light); padding: 0.25rem 0.6rem; border-radius: 4px; font-size: 1.1rem; letter-spacing: 1px;">${clientIdFormatted}</span></p>
                <p><strong>Internal ID:</strong> <span style="font-family: monospace; color: var(--text-light); font-size: 0.85rem;">#${org.id}</span></p>
                <p><strong>Name:</strong> ${org.name}</p>
                <p><strong>Slug:</strong> ${org.slug || 'N/A'}</p>
                <p><strong>Created:</strong> ${new Date(org.created_at).toLocaleDateString()}</p>
                <p><strong>Members:</strong> ${org.member_count || 0}</p>
            </div>
            <div>
                <h4 style="color: var(--primary); margin-bottom: 0.5rem;">Subscription</h4>
                <p><strong>Plan:</strong> ${org.plan_name || 'Starter'}</p>
                <p><strong>Status:</strong> <span class="status-badge status-${status}">${status.toUpperCase()}</span></p>
                <p><strong>Price:</strong> ${formatCurrency(org.price_monthly || 0)}/month</p>
                <p><strong>Trial Ends:</strong> ${org.trial_ends_at ? new Date(org.trial_ends_at).toLocaleDateString() : 'N/A'}</p>
                <p><strong>Billing Cycle:</strong> ${org.billing_cycle || 'monthly'}</p>
            </div>
        </div>
        <div style="margin-top: 1rem;">
            <h4 style="color: var(--primary); margin-bottom: 0.5rem;">Contact</h4>
            <p><strong>Admin:</strong> ${org.admin_name || 'N/A'}</p>
            <p><strong>Email:</strong> ${org.admin_email || org.billing_email || 'N/A'}</p>
        </div>
    `;
    
    const modal = document.getElementById('viewOrgModal');
    if (modal) modal.style.display = 'flex';
}

function closeViewOrgModal() {
    const modal = document.getElementById('viewOrgModal');
    if (modal) modal.style.display = 'none';
}

async function renewOrganization(orgId) {
    if (!confirm('Renew subscription for this organization?')) return;
    try {
        await api.put(`/platform/organizations/${orgId}/renew`);
        showToast('Subscription renewed', 'success');
        loadOrganizations();
        loadPlatformStats();
    } catch (error) {
        showToast(error.message || 'Failed to renew', 'error');
    }
}

async function suspendOrganization(orgId) {
    if (!confirm('Suspend this organization?')) return;
    try {
        await api.put(`/platform/organizations/${orgId}/suspend`);
        showToast('Organization suspended', 'success');
        // Clear status filter to show updated status
        const statusFilter = document.getElementById('orgStatusFilter');
        if (statusFilter) statusFilter.value = '';
        // Force refresh
        setTimeout(() => {
            loadOrganizations();
            loadPlatformStats();
        }, 500);
    } catch (error) {
        showToast(error.message || 'Failed to suspend', 'error');
    }
}

async function activateOrganization(orgId) {
    if (!confirm('Activate this organization?')) return;
    try {
        await api.put(`/platform/organizations/${orgId}/activate`);
        showToast('Organization activated', 'success');
        // Clear status filter to show updated status
        const statusFilter = document.getElementById('orgStatusFilter');
        if (statusFilter) statusFilter.value = '';
        // Small delay to ensure DB is updated before refresh
        setTimeout(() => {
            loadOrganizations();
            loadPlatformStats();
        }, 300);
    } catch (error) {
        showToast(error.message || 'Failed to activate', 'error');
    }
}

async function deleteOrganization(orgId) {
    if (!confirm('WARNING: Permanently delete this organization and ALL its data?')) return;
    try {
        await api.delete(`/platform/organizations/${orgId}`);
        showToast('Organization deleted', 'success');
        loadOrganizations();
        loadPlatformStats();
    } catch (error) {
        showToast(error.message || 'Failed to delete', 'error');
    }
}

// ==================== CHANGE PLAN FUNCTIONALITY ====================

let availablePlans = [];

async function loadPlansForDropdown() {
    try {
        const result = await api.get('/saas/info');
        availablePlans = result.plans || [];
        
        const select = document.getElementById('changePlanNewPlan');
        if (select) {
            select.innerHTML = availablePlans.map(plan => 
                `<option value="${plan.id}">${plan.name} - ${formatCurrency(plan.price?.monthly || plan.price_monthly)}/mo (${formatCurrency(plan.price?.yearly || plan.price_yearly || (plan.price_monthly * 10))}/yr)</option>`
            ).join('');
        }
    } catch (error) {
        console.error('Failed to load plans:', error);
    }
}

function openChangePlanModal(orgId) {
    const org = allOrganizations.find(o => o.id === orgId);
    if (!org) return;
    
    // Load plans first
    loadPlansForDropdown();
    
    // Set organization details
    document.getElementById('changePlanOrgId').value = orgId;
    document.getElementById('changePlanOrgName').value = org.name;
    document.getElementById('changePlanCurrentPlan').value = `${org.plan_name || 'Unknown'} (${formatCurrency(org.price_monthly || 0)}/mo)`;
    
    // Reset form
    document.getElementById('changePlanBillingCycle').value = 'monthly';
    document.getElementById('changePlanType').value = 'manual';
    document.getElementById('changePlanReason').value = '';
    
    // Show modal
    const modal = document.getElementById('changePlanModal');
    if (modal) modal.style.display = 'flex';
}

function closeChangePlanModal() {
    const modal = document.getElementById('changePlanModal');
    if (modal) modal.style.display = 'none';
}

async function submitPlanChange() {
    const orgId = document.getElementById('changePlanOrgId').value;
    const planId = document.getElementById('changePlanNewPlan').value;
    const billingCycle = document.getElementById('changePlanBillingCycle').value;
    const changeType = document.getElementById('changePlanType').value;
    const reason = document.getElementById('changePlanReason').value;
    
    if (!orgId || !planId) {
        showToast('Missing required information', 'error');
        return;
    }
    
    const org = allOrganizations.find(o => o.id === parseInt(orgId));
    const selectedPlan = availablePlans.find(p => p.id === parseInt(planId));
    
    let confirmMessage = `Change plan for ${org?.name || 'this organization'} to ${selectedPlan?.name || 'selected plan'}?`;
    if (changeType === 'complimentary') {
        confirmMessage += '\n\n⚠️ This will set the plan as complimentary/free.';
    }
    
    if (!confirm(confirmMessage)) return;
    
    try {
        showToast('Updating plan...', 'info');
        
        const result = await api.put(`/platform/organizations/${orgId}/plan`, {
            plan_id: parseInt(planId),
            billing_cycle: billingCycle,
            change_type: changeType,
            reason: reason
        });
        
        showToast(`Plan changed to ${result.organization.plan_name}`, 'success');
        closeChangePlanModal();
        loadOrganizations();
        loadPlatformStats();
    } catch (error) {
        console.error('Change plan error:', error);
        showToast(error.message || 'Failed to change plan', 'error');
    }
}

// ==================== DATA EXPORT ====================

async function exportPlatformData() {
    try {
        showToast('Preparing platform export...', 'info');
        const data = await api.get('/export/platform');
        
        // Create and download JSON file
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `platform-export-${new Date().toISOString().split('T')[0]}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        
        showToast('Export downloaded', 'success');
    } catch (error) {
        console.error('Export error:', error);
        showToast('Failed to export data', 'error');
    }
}

// ==================== PLATFORM ACTIVITY ====================

let allActivities = []; // Store all activities for filtering

async function loadPlatformActivity() {
    const container = document.getElementById('platformActivity');
    if (!container) return;
    
    container.innerHTML = `
        <div class="loading-state">
            <i class="fas fa-spinner fa-spin"></i>
            <p>Loading activities...</p>
        </div>
    `;
    
    try {
        const result = await api.get('/platform/activity');
        allActivities = result.activities || [];
        
        if (allActivities.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-history"></i>
                    <p>No recent activity</p>
                    <small style="color: var(--text-light);">Activities will appear when you perform actions like editing plans, suspending organizations, etc.</small>
                </div>
            `;
            return;
        }
        
        displayActivities(allActivities);
    } catch (error) {
        console.error('Failed to load activity:', error);
        container.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-exclamation-circle"></i>
                <p>Failed to load activities</p>
                <small style="color: var(--text-light);">${error.message}</small>
            </div>
        `;
    }
}

function displayActivities(activities) {
    const container = document.getElementById('platformActivity');
    if (!container) return;
    
    if (activities.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-search"></i>
                <p>No activities found matching your search</p>
            </div>
        `;
        return;
    }
    
    // Build table with requested columns
    let tableHTML = `
        <table>
            <thead>
                <tr>
                    <th>Incident ID</th>
                    <th>Date</th>
                    <th>Time</th>
                    <th>Changed Made By</th>
                    <th>Email</th>
                    <th>What's the Change</th>
                </tr>
            </thead>
            <tbody>
    `;
    
    activities.forEach(activity => {
        const dateObj = new Date(activity.created_at);
        const dateStr = dateObj.toLocaleDateString();
        const timeStr = dateObj.toLocaleTimeString();
        
        // Get user name and email
        let changedBy = 'System';
        let email = '-';
        if (activity.user_email && activity.user_email !== 'System') {
            // Extract name and email if in format "Name (email)"
            const match = activity.user_email.match(/^(.*?)\s*\((.*)\)$/);
            if (match) {
                changedBy = match[1];
                email = match[2];
            } else {
                changedBy = activity.user_email.split('@')[0];
                email = activity.user_email;
            }
        }
        
        // Build "What's the Change" description
        let changeDescription = '-';
        try {
            if (activity.action) {
                const actionText = activity.action.replace(/_/g, ' ').toUpperCase();
                
                if (activity.new_values) {
                    const newVals = typeof activity.new_values === 'string' ? 
                        JSON.parse(activity.new_values) : activity.new_values;
                    
                    if (activity.action === 'plan_updated' && newVals.name) {
                        changeDescription = `Updated plan "${newVals.name}" - Price: ${formatCurrency(newVals.price_monthly || 0)}/mo`;
                    } else if (activity.action === 'plan_created' && newVals.name) {
                        changeDescription = `Created new plan "${newVals.name}" - Price: ${formatCurrency(newVals.price_monthly || 0)}/mo`;
                    } else if (activity.action === 'plan_changed' && newVals.plan_name) {
                        changeDescription = `Changed organization plan to "${newVals.plan_name}"`;
                    } else if (activity.action === 'organization_suspended' && newVals.reason) {
                        changeDescription = `Suspended organization - Reason: ${newVals.reason}`;
                    } else if (activity.action === 'organization_activated') {
                        changeDescription = `Activated organization`;
                    } else if (activity.action === 'organization_renewed') {
                        changeDescription = `Renewed organization subscription`;
                    } else if (activity.action === 'organization_deleted' && newVals.name) {
                        changeDescription = `Deleted organization "${newVals.name}"`;
                    } else if (Object.keys(newVals).length > 0) {
                        changeDescription = `${actionText}: ${JSON.stringify(newVals).substring(0, 80)}`;
                    } else {
                        changeDescription = actionText;
                    }
                } else {
                    changeDescription = actionText;
                }
            }
        } catch (e) {
            changeDescription = activity.action?.replace(/_/g, ' ').toUpperCase() || 'Unknown';
        }
        
        tableHTML += `
            <tr>
                <td style="font-family: monospace; font-size: 0.8rem; font-weight: 600;">#${activity.id}</td>
                <td>${dateStr}</td>
                <td>${timeStr}</td>
                <td>${changedBy}</td>
                <td>${email}</td>
                <td style="max-width: 400px; overflow: hidden; text-overflow: ellipsis;">${changeDescription}</td>
            </tr>
        `;
    });
    
    tableHTML += '</tbody></table>';
    container.innerHTML = tableHTML;
}

function filterActivities() {
    const searchInput = document.getElementById('activitySearch');
    if (!searchInput) return;
    
    const searchTerm = searchInput.value.toLowerCase().trim();
    
    if (!searchTerm) {
        displayActivities(allActivities);
        return;
    }
    
    const filtered = allActivities.filter(activity => {
        // Search by incident ID
        if (activity.id.toString() === searchTerm || activity.id.toString() === searchTerm.replace('#', '')) {
            return true;
        }
        
        // Search by date
        const dateStr = new Date(activity.created_at).toLocaleDateString().toLowerCase();
        if (dateStr.includes(searchTerm)) {
            return true;
        }
        
        // Search by action
        if (activity.action && activity.action.toLowerCase().includes(searchTerm)) {
            return true;
        }
        
        // Search by user email/name
        if (activity.user_email && activity.user_email.toLowerCase().includes(searchTerm)) {
            return true;
        }
        
        // Search by change description
        try {
            if (activity.new_values) {
                const newVals = typeof activity.new_values === 'string' ? 
                    activity.new_values : JSON.stringify(activity.new_values);
                if (newVals.toLowerCase().includes(searchTerm)) {
                    return true;
                }
            }
        } catch (e) {}
        
        return false;
    });
    
    displayActivities(filtered);
}

function getActionBadgeClass(action) {
    const badgeClasses = {
        'plan_created': 'badge-success',
        'plan_updated': 'badge-primary',
        'plan_changed': 'badge-info',
        'organization_activated': 'badge-success',
        'organization_suspended': 'badge-warning',
        'organization_renewed': 'badge-primary',
        'organization_deleted': 'badge-danger',
        'organization_created': 'badge-success',
        'payment_succeeded': 'badge-success',
        'payment_failed': 'badge-danger',
        'subscription_started': 'badge-success',
        'subscription_cancelled': 'badge-danger',
        'default': 'badge-secondary'
    };
    return badgeClasses[action] || badgeClasses['default'];
}

function getActivityIcon(action) {
    const icons = {
        'organization_created': 'building',
        'organization_suspended': 'ban',
        'organization_activated': 'check-circle',
        'organization_renewed': 'sync',
        'organization_deleted': 'trash',
        'user_registered': 'user-plus',
        'subscription_started': 'credit-card',
        'subscription_cancelled': 'times-circle',
        'payment_succeeded': 'dollar-sign',
        'payment_failed': 'exclamation-circle',
        'limit_warning': 'exclamation-triangle',
        'plan_changed': 'exchange-alt',
        'plan_created': 'plus-circle',
        'plan_updated': 'edit',
        'default': 'circle'
    };
    return icons[action] || icons['default'];
}

// ==================== NEW ORGANIZATION MODAL ====================

function openNewOrgModal() {
    const modal = document.getElementById('newOrgModal');
    if (!modal) {
        showToast('Error: Modal not found', 'error');
        return;
    }
    modal.style.display = 'flex';
    
    // Clear fields
    ['newOrgName', 'newOrgSlug', 'newOrgAdminFirstName', 'newOrgAdminLastName', 'newOrgAdminEmail', 'newOrgAdminPassword'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = '';
    });
}

function closeNewOrgModal() {
    const modal = document.getElementById('newOrgModal');
    if (modal) modal.style.display = 'none';
}

function generateSlug() {
    const name = document.getElementById('newOrgName')?.value || '';
    const slugInput = document.getElementById('newOrgSlug');
    
    if (name && slugInput && !slugInput.value) {
        slugInput.value = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    }
}

function generatePassword() {
    const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*';
    let password = '';
    for (let i = 0; i < 12; i++) password += chars.charAt(Math.floor(Math.random() * chars.length));
    
    const pwField = document.getElementById('newOrgAdminPassword');
    if (pwField) pwField.value = password;
    showToast(`Password: ${password}`, 'info', 5000);
}

async function submitNewOrganization() {
    const name = document.getElementById('newOrgName')?.value.trim();
    const slug = document.getElementById('newOrgSlug')?.value.trim();
    const planId = document.getElementById('newOrgPlan')?.value;
    const adminFirstName = document.getElementById('newOrgAdminFirstName')?.value.trim();
    const adminLastName = document.getElementById('newOrgAdminLastName')?.value.trim();
    const adminEmail = document.getElementById('newOrgAdminEmail')?.value.trim();
    const adminPassword = document.getElementById('newOrgAdminPassword')?.value;
    const termLength = document.getElementById('newOrgTermLength')?.value;
    const renewalDays = document.getElementById('newOrgRenewalDays')?.value;
    
    if (!name || !slug || !adminFirstName || !adminLastName || !adminEmail || !adminPassword) {
        showToast('Please fill in all required fields', 'error');
        return;
    }
    
    if (adminPassword.length < 8) {
        showToast('Password must be at least 8 characters', 'error');
        return;
    }
    
    if (!/^[a-z0-9-]+$/.test(slug)) {
        showToast('Slug must be lowercase alphanumeric with hyphens only', 'error');
        return;
    }
    
    try {
        showToast('Creating organization...', 'info');
        
        await api.post('/organizations', {
            name, slug, plan_id: parseInt(planId),
            admin_email: adminEmail,
            admin_first_name: adminFirstName,
            admin_last_name: adminLastName,
            admin_password: adminPassword,
            default_term_length: parseInt(termLength),
            renewal_notification_days: parseInt(renewalDays),
            enable_term_tracking: true
        });
        
        showToast(`Organization "${name}" created!`, 'success');
        closeNewOrgModal();
        loadOrganizations();
        loadPlatformStats();
        
        setTimeout(() => {
            alert(`Organization created!\n\nName: ${name}\nAdmin: ${adminEmail}\nPassword: ${adminPassword}`);
        }, 300);
    } catch (error) {
        showToast(error.message || 'Failed to create organization', 'error');
    }
}

// ==================== PLAN MANAGEMENT ====================

function openPlanModal() {
    // Reset form
    document.getElementById('addPlanName').value = '';
    document.getElementById('addPlanSlug').value = '';
    document.getElementById('addPlanDescription').value = '';
    document.getElementById('addPlanPriceMonthly').value = '49';
    document.getElementById('addPlanPriceYearly').value = '490';
    document.getElementById('addPlanMaxUsers').value = '5';
    document.getElementById('addPlanMaxCommittees').value = '3';
    document.getElementById('addPlanMaxStorage').value = '5120';
    document.getElementById('addPlanStripeMonthly').value = '';
    document.getElementById('addPlanStripeYearly').value = '';
    document.getElementById('addPlanIsPopular').checked = false;
    document.getElementById('addPlanIsActive').checked = true;
    document.getElementById('addPlanFeatures').value = '';
    
    // Update currency labels
    const symbol = getCurrencySymbol();
    const monthlyLabel = document.getElementById('addPlanMonthlyLabel');
    const yearlyLabel = document.getElementById('addPlanYearlyLabel');
    if (monthlyLabel) monthlyLabel.textContent = `Monthly Price (${symbol}) *`;
    if (yearlyLabel) yearlyLabel.textContent = `Yearly Price (${symbol}) *`;
    
    // Show modal
    const modal = document.getElementById('addPlanModal');
    if (modal) modal.style.display = 'flex';
}

function closeAddPlanModal() {
    const modal = document.getElementById('addPlanModal');
    if (modal) modal.style.display = 'none';
}

async function submitAddPlan() {
    const name = document.getElementById('addPlanName').value.trim();
    const slug = document.getElementById('addPlanSlug').value.trim().toLowerCase();
    const description = document.getElementById('addPlanDescription').value.trim();
    const priceMonthly = parseFloat(document.getElementById('addPlanPriceMonthly').value);
    const priceYearly = parseFloat(document.getElementById('addPlanPriceYearly').value);
    const maxUsers = parseInt(document.getElementById('addPlanMaxUsers').value);
    const maxCommittees = parseInt(document.getElementById('addPlanMaxCommittees').value);
    const maxStorage = parseInt(document.getElementById('addPlanMaxStorage').value);
    const stripeMonthly = document.getElementById('addPlanStripeMonthly').value.trim();
    const stripeYearly = document.getElementById('addPlanStripeYearly').value.trim();
    const isPopular = document.getElementById('addPlanIsPopular').checked;
    const isActive = document.getElementById('addPlanIsActive').checked;
    const featuresText = document.getElementById('addPlanFeatures').value.trim();
    
    // Validation
    if (!name || !slug) {
        showToast('Plan name and code are required', 'error');
        return;
    }
    if (isNaN(priceMonthly) || priceMonthly < 0) {
        showToast('Valid monthly price is required', 'error');
        return;
    }
    if (isNaN(maxUsers) || maxUsers < 1) {
        showToast('Valid max users is required', 'error');
        return;
    }
    
    // Parse features
    const features = featuresText ? featuresText.split('\n').map(f => f.trim()).filter(f => f) : [];
    
    const planData = {
        name,
        slug,
        description,
        price_monthly: priceMonthly,
        price_yearly: priceYearly,
        max_users: maxUsers,
        max_committees: maxCommittees,
        max_storage_mb: maxStorage,
        stripe_price_id_monthly: stripeMonthly || null,
        stripe_price_id_yearly: stripeYearly || null,
        is_popular: isPopular,
        is_active: isActive,
        features: JSON.stringify(features)
    };
    
    try {
        showToast('Creating plan...', 'info');
        await api.post('/platform/plans', planData);
        showToast('Plan created successfully', 'success');
        closeAddPlanModal();
        loadPlans();
        loadPlatformStats();
    } catch (error) {
        console.error('Create plan error:', error);
        showToast(error.message || 'Failed to create plan', 'error');
    }
}

// Store all plans for editing
let allPlans = [];

async function loadPlans() {
    try {
        // Use platform admin endpoint to get all plans (including inactive)
        const result = await api.get('/platform/plans');
        allPlans = result.plans || [];
        
        const grid = document.getElementById('plansGrid');
        if (!grid) return;
        
        if (allPlans.length === 0) {
            grid.innerHTML = '<div class="empty-state"><i class="fas fa-tags"></i><p>No plans found</p></div>';
            return;
        }
        
        grid.innerHTML = allPlans.map(plan => `
            <div class="plan-card-platform ${plan.is_popular ? 'popular' : ''}">
                ${plan.is_popular ? '<span class="plan-popular-badge">POPULAR</span>' : ''}
                <h4>${plan.name}</h4>
                <div class="plan-price-platform">${formatCurrency(plan.price?.monthly || plan.price_monthly || 0)}<span>/month</span></div>
                <p style="color: var(--text-light); font-size: 0.9rem; margin-bottom: 1rem;">${plan.description || ''}</p>
                <ul style="list-style: none; padding: 0; margin-bottom: 1.5rem;">
                    <li style="padding: 0.5rem 0; border-bottom: 1px solid var(--border);">
                        <i class="fas fa-users" style="color: var(--primary); margin-right: 0.5rem;"></i>
                        Up to ${plan.limits?.users || plan.max_users || '-'} users
                    </li>
                    <li style="padding: 0.5rem 0; border-bottom: 1px solid var(--border);">
                        <i class="fas fa-users-cog" style="color: var(--primary); margin-right: 0.5rem;"></i>
                        Up to ${plan.limits?.committees || plan.max_committees || '-'} committees
                    </li>
                    <li style="padding: 0.5rem 0;">
                        <i class="fas fa-hdd" style="color: var(--primary); margin-right: 0.5rem;"></i>
                        ${(plan.limits?.storage_mb || plan.max_storage_mb || 0) >= 1024 ? 
                            ((plan.limits?.storage_mb || plan.max_storage_mb || 0)/1024) + 'GB' : 
                            (plan.limits?.storage_mb || plan.max_storage_mb || 0) + 'MB'} storage
                    </li>
                </ul>
                <button class="btn btn-sm btn-secondary" style="width: 100%;" onclick="editPlan(${plan.id})">
                    <i class="fas fa-edit"></i> Edit Plan
                </button>
            </div>
        `).join('');
        
        // Update select dropdown in modal
        const planSelect = document.getElementById('newOrgPlan');
        if (planSelect) {
            planSelect.innerHTML = allPlans.map(plan => 
                `<option value="${plan.id}">${plan.name} (${formatCurrency(plan.price?.monthly || plan.price_monthly)}/mo)</option>`
            ).join('');
        }
    } catch (error) {
        console.error('Failed to load plans:', error);
    }
}

function editPlan(planId) {
    const plan = allPlans.find(p => p.id === planId);
    if (!plan) {
        showToast('Plan not found', 'error');
        return;
    }
    
    // Update currency labels
    const symbol = getCurrencySymbol();
    const monthlyLabel = document.getElementById('editPlanMonthlyLabel');
    const yearlyLabel = document.getElementById('editPlanYearlyLabel');
    if (monthlyLabel) monthlyLabel.textContent = `Monthly Price (${symbol}) *`;
    if (yearlyLabel) yearlyLabel.textContent = `Yearly Price (${symbol}) *`;
    
    // Populate the modal
    document.getElementById('editPlanId').value = plan.id;
    document.getElementById('editPlanName').value = plan.name || '';
    document.getElementById('editPlanSlug').value = plan.slug || '';
    document.getElementById('editPlanDescription').value = plan.description || '';
    document.getElementById('editPlanPriceMonthly').value = plan.price?.monthly || plan.price_monthly || '';
    document.getElementById('editPlanPriceYearly').value = plan.price?.yearly || plan.price_yearly || '';
    document.getElementById('editPlanMaxUsers').value = plan.limits?.users || plan.max_users || '';
    document.getElementById('editPlanMaxCommittees').value = plan.limits?.committees || plan.max_committees || '';
    document.getElementById('editPlanMaxStorage').value = plan.limits?.storage_mb || plan.max_storage_mb || '';
    document.getElementById('editPlanStripeMonthly').value = plan.stripe_price_id_monthly || '';
    document.getElementById('editPlanStripeYearly').value = plan.stripe_price_id_yearly || '';
    document.getElementById('editPlanIsPopular').checked = plan.is_popular || false;
    document.getElementById('editPlanIsActive').checked = plan.is_active !== false;
    
    // Format features as text
    const features = plan.features || [];
    document.getElementById('editPlanFeatures').value = Array.isArray(features) ? features.join('\n') : features;
    
    // Show the modal
    const modal = document.getElementById('editPlanModal');
    if (modal) modal.style.display = 'flex';
}

function closeEditPlanModal() {
    const modal = document.getElementById('editPlanModal');
    if (modal) modal.style.display = 'none';
}

async function submitEditPlan() {
    const planId = document.getElementById('editPlanId').value;
    const name = document.getElementById('editPlanName').value.trim();
    const slug = document.getElementById('editPlanSlug').value.trim().toLowerCase();
    const description = document.getElementById('editPlanDescription').value.trim();
    const priceMonthly = parseFloat(document.getElementById('editPlanPriceMonthly').value);
    const priceYearly = parseFloat(document.getElementById('editPlanPriceYearly').value);
    const maxUsers = parseInt(document.getElementById('editPlanMaxUsers').value);
    const maxCommittees = parseInt(document.getElementById('editPlanMaxCommittees').value) || 0;
    const maxStorage = parseInt(document.getElementById('editPlanMaxStorage').value) || 0;
    const stripeMonthly = document.getElementById('editPlanStripeMonthly').value.trim();
    const stripeYearly = document.getElementById('editPlanStripeYearly').value.trim();
    const isPopular = document.getElementById('editPlanIsPopular').checked;
    const isActive = document.getElementById('editPlanIsActive').checked;
    const featuresText = document.getElementById('editPlanFeatures').value;
    
    // Validation
    if (!name || !slug || !priceMonthly || !priceYearly || !maxUsers) {
        showToast('Please fill in all required fields', 'error');
        return;
    }
    
    // Parse features
    const features = featuresText.split('\n').map(f => f.trim()).filter(f => f);
    
    const planData = {
        name,
        slug,
        description,
        price_monthly: priceMonthly,
        price_yearly: priceYearly,
        max_users: maxUsers,
        max_committees: maxCommittees,
        max_storage_mb: maxStorage,
        stripe_price_id_monthly: stripeMonthly,
        stripe_price_id_yearly: stripeYearly,
        is_popular: isPopular,
        is_active: isActive,
        features
    };
    
    try {
        showToast('Saving plan...', 'info');
        await api.put(`/platform/plans/${planId}`, planData);
        showToast('Plan updated successfully', 'success');
        closeEditPlanModal();
        loadPlans();
    } catch (error) {
        console.error('Update plan error:', error);
        showToast(error.message || 'Failed to update plan', 'error');
    }
}

// ==================== CACHE MANAGEMENT ====================

async function checkCacheStatus() {
    try {
        const status = await api.get('/cache/status');
        
        document.getElementById('cacheMemory').textContent = status.memory?.used || '-';
        document.getElementById('cacheUptime').textContent = status.uptime?.server || '-';
        document.getElementById('cacheModules').textContent = status.modules?.cached || '-';
        document.getElementById('cacheDbStatus').textContent = status.database?.connected ? 'Connected' : 'Error';
        
        const msgDiv = document.getElementById('cacheMessage');
        msgDiv.style.display = 'block';
        msgDiv.style.background = '#d1fae5';
        msgDiv.style.color = '#065f46';
        msgDiv.textContent = '✅ Cache status updated';
        
        setTimeout(() => {
            msgDiv.style.display = 'none';
        }, 3000);
    } catch (error) {
        console.error('Cache status error:', error);
        showToast('Failed to get cache status', 'error');
    }
}

async function clearServerCache() {
    if (!confirm('Clear server cache? This will refresh database connections and clear module cache.')) {
        return;
    }
    
    try {
        showToast('Clearing cache...', 'info');
        
        // Clear server cache
        const result = await api.post('/cache/clear', { type: 'all' });
        
        // Also flush Supabase
        await api.post('/cache/flush-supabase', {});
        
        const msgDiv = document.getElementById('cacheMessage');
        msgDiv.style.display = 'block';
        msgDiv.style.background = '#d1fae5';
        msgDiv.style.color = '#065f46';
        msgDiv.textContent = '✅ ' + (result.message || 'Cache cleared successfully');
        
        // Refresh status
        await checkCacheStatus();
        
        setTimeout(() => {
            msgDiv.style.display = 'none';
        }, 5000);
        
        showToast('Cache cleared successfully', 'success');
    } catch (error) {
        console.error('Clear cache error:', error);
        showToast('Failed to clear cache: ' + error.message, 'error');
    }
}

// ==================== GLOBAL EXPORTS ====================

window.switchPlatformTab = switchPlatformTab;
window.checkCacheStatus = checkCacheStatus;
window.clearServerCache = clearServerCache;
window.loadOrganizations = loadOrganizations;
window.filterClients = filterClients;
window.viewOrganization = viewOrganization;
window.closeViewOrgModal = closeViewOrgModal;
window.renewOrganization = renewOrganization;
window.suspendOrganization = suspendOrganization;
window.activateOrganization = activateOrganization;
window.deleteOrganization = deleteOrganization;
window.loadPlans = loadPlans;
window.loadPlatformActivity = loadPlatformActivity;
window.filterActivities = filterActivities;
window.loadDashboardSummary = loadDashboardSummary;
window.loadGrowthMetrics = loadGrowthMetrics;
window.loadRevenueAnalytics = loadRevenueAnalytics;
window.loadOrganizationHealth = loadOrganizationHealth;
window.loadUsageWarnings = loadUsageWarnings;
window.loadWhiteLabelStats = loadWhiteLabelStats;
window.exportPlatformData = exportPlatformData;
window.openNewOrgModal = openNewOrgModal;
window.closeNewOrgModal = closeNewOrgModal;
window.generateSlug = generateSlug;
window.generatePassword = generatePassword;
window.submitNewOrganization = submitNewOrganization;
window.openPlanModal = openPlanModal;
window.closeAddPlanModal = closeAddPlanModal;
window.submitAddPlan = submitAddPlan;
window.editPlan = editPlan;
window.closeEditPlanModal = closeEditPlanModal;
window.submitEditPlan = submitEditPlan;
window.openChangePlanModal = openChangePlanModal;
window.closeChangePlanModal = closeChangePlanModal;
window.submitPlanChange = submitPlanChange;

// Initialize
let currentPlatformTab = 'clients';

document.addEventListener('DOMContentLoaded', function() {
    const platformNav = document.querySelector('[data-module="platformAdmin"]');
    if (platformNav) {
        platformNav.addEventListener('click', function() {
            loadPlatformStats();
            switchPlatformTab('clients');
        });
    }
    
    // Initialize currency selector
    const currencySelector = document.getElementById('platformCurrencySelector');
    if (currencySelector) {
        currencySelector.value = getCurrentCurrency();
    }
});
