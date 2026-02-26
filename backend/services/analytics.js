/**
 * Analytics Service
 * Phase 5: Platform Admin Dashboard - Revenue Analytics, Churn Tracking, Growth Metrics
 * Updated for Supabase PostgreSQL compatibility
 */

const db = require('../config/database');

class AnalyticsService {
    /**
     * Get revenue analytics
     */
    async getRevenueAnalytics(startDate, endDate) {
        try {
            // Get all organizations and plans using table API
            const organizations = await db.query('organizations', {
                select: 'id, plan_id, subscription_status, created_at'
            });
            
            const plans = await db.query('subscription_plans', {
                select: 'id, name, price_monthly, price_yearly'
            });
            
            const planMap = {};
            plans.forEach(p => planMap[p.id] = p);

            // Filter by date range
            const start = new Date(startDate);
            const end = new Date(endDate);
            const filteredOrgs = organizations.filter(o => {
                const created = new Date(o.created_at);
                return created >= start && created <= end;
            });

            // Calculate monthly breakdown (simplified - group by month manually)
            const monthlyMap = {};
            filteredOrgs.forEach(o => {
                const month = o.created_at.substring(0, 7); // YYYY-MM
                const plan = planMap[o.plan_id] || { name: 'Unknown', price_monthly: 0 };
                const key = `${month}-${plan.name}`;
                
                if (!monthlyMap[key]) {
                    monthlyMap[key] = {
                        month,
                        plan_name: plan.name,
                        new_organizations: 0,
                        monthly_recurring_revenue: 0
                    };
                }
                monthlyMap[key].new_organizations++;
                monthlyMap[key].monthly_recurring_revenue += plan.price_monthly || 0;
            });

            // Total MRR (Monthly Recurring Revenue)
            const activeOrgs = organizations.filter(o => o.subscription_status === 'active');
            const totalMrr = activeOrgs.reduce((sum, o) => {
                const plan = planMap[o.plan_id] || { price_monthly: 0 };
                return sum + (plan.price_monthly || 0);
            }, 0);

            // Revenue by plan
            const revenueByPlanMap = {};
            activeOrgs.forEach(o => {
                const plan = planMap[o.plan_id] || { name: 'Unknown', price_monthly: 0 };
                if (!revenueByPlanMap[plan.name]) {
                    revenueByPlanMap[plan.name] = {
                        plan_name: plan.name,
                        organization_count: 0,
                        monthly_revenue: 0,
                        avg_revenue_per_org: 0
                    };
                }
                revenueByPlanMap[plan.name].organization_count++;
                revenueByPlanMap[plan.name].monthly_revenue += plan.price_monthly || 0;
            });
            
            // Calculate averages
            Object.values(revenueByPlanMap).forEach(r => {
                r.avg_revenue_per_org = r.organization_count > 0 
                    ? Math.round((r.monthly_revenue / r.organization_count) * 100) / 100
                    : 0;
            });

            return {
                total_mrr: totalMrr,
                estimated_arr: Math.round(totalMrr * 12 * 100) / 100,
                monthly_breakdown: Object.values(monthlyMap).sort((a, b) => b.month.localeCompare(a.month)),
                by_plan: Object.values(revenueByPlanMap).sort((a, b) => b.monthly_revenue - a.monthly_revenue)
            };
        } catch (error) {
            console.error('Get revenue analytics error:', error);
            return null;
        }
    }

    /**
     * Get churn analytics
     */
    async getChurnAnalytics(days = 90) {
        try {
            const startDate = new Date();
            startDate.setDate(startDate.getDate() - days);

            // Get organizations and plans
            const organizations = await db.query('organizations', {
                select: 'id, name, slug, plan_id, subscription_status, created_at, updated_at'
            });
            
            const plans = await db.query('subscription_plans', {
                select: 'id, name, price_monthly'
            });
            
            const planMap = {};
            plans.forEach(p => planMap[p.id] = p);

            // Filter cancelled organizations
            const cancelled = organizations.filter(o => {
                if (o.subscription_status !== 'cancelled') return false;
                const updated = new Date(o.updated_at);
                return updated >= startDate;
            }).map(o => {
                const plan = planMap[o.plan_id] || { name: 'Unknown', price_monthly: 0 };
                const signupDate = new Date(o.created_at);
                const cancelDate = new Date(o.updated_at);
                const lifetimeDays = Math.round((cancelDate - signupDate) / (1000 * 60 * 60 * 24));
                
                return {
                    id: o.id,
                    name: o.name,
                    slug: o.slug,
                    plan_name: plan.name,
                    price_monthly: plan.price_monthly,
                    signup_date: o.created_at,
                    cancellation_date: o.updated_at,
                    lifetime_days: lifetimeDays
                };
            });

            // Calculate churn metrics
            const totalAtStart = organizations.filter(o => {
                const created = new Date(o.created_at);
                return created < startDate;
            }).length;

            const churnRate = totalAtStart > 0 ? (cancelled.length / totalAtStart) * 100 : 0;
            const revenueChurn = cancelled.reduce((sum, c) => sum + (c.price_monthly || 0), 0);

            // Churn by plan
            const churnByPlanMap = {};
            cancelled.forEach(c => {
                if (!churnByPlanMap[c.plan_name]) {
                    churnByPlanMap[c.plan_name] = {
                        plan_name: c.plan_name,
                        cancellations: 0,
                        lost_revenue: 0
                    };
                }
                churnByPlanMap[c.plan_name].cancellations++;
                churnByPlanMap[c.plan_name].lost_revenue += c.price_monthly || 0;
            });

            // Average lifetime
            const avgLifetime = cancelled.length > 0
                ? cancelled.reduce((sum, c) => sum + c.lifetime_days, 0) / cancelled.length
                : 0;

            return {
                period_days: days,
                total_cancellations: cancelled.length,
                churn_rate_percent: Math.round(churnRate * 100) / 100,
                revenue_churn_monthly: revenueChurn,
                avg_lifetime_days: Math.round(avgLifetime),
                churn_by_plan: Object.values(churnByPlanMap),
                cancellations: cancelled.slice(0, 50)
            };
        } catch (error) {
            console.error('Get churn analytics error:', error);
            return null;
        }
    }

    /**
     * Get growth metrics
     */
    async getGrowthMetrics(days = 90) {
        try {
            const startDate = new Date();
            startDate.setDate(startDate.getDate() - days);

            // Get organizations and plans
            const organizations = await db.query('organizations', {
                select: 'id, plan_id, subscription_status, created_at'
            });
            
            const plans = await db.query('subscription_plans', {
                select: 'id, name'
            });
            
            const planMap = {};
            plans.forEach(p => planMap[p.id] = p);

            // Filter by date
            const filteredOrgs = organizations.filter(o => {
                const created = new Date(o.created_at);
                return created >= startDate;
            });

            // Daily signups
            const dailyMap = {};
            filteredOrgs.forEach(o => {
                const date = o.created_at.split('T')[0];
                if (!dailyMap[date]) {
                    dailyMap[date] = { date, new_organizations: 0 };
                }
                dailyMap[date].new_organizations++;
            });

            // Signups by plan
            const signupsByPlanMap = {};
            filteredOrgs.forEach(o => {
                const plan = planMap[o.plan_id] || { name: 'Unknown' };
                if (!signupsByPlanMap[plan.name]) {
                    signupsByPlanMap[plan.name] = { plan_name: plan.name, signups: 0 };
                }
                signupsByPlanMap[plan.name].signups++;
            });

            // Trial conversion
            const trialConversionMap = {};
            filteredOrgs.forEach(o => {
                const plan = planMap[o.plan_id] || { name: 'Unknown' };
                if (!trialConversionMap[plan.name]) {
                    trialConversionMap[plan.name] = {
                        plan_name: plan.name,
                        converted: 0,
                        still_in_trial: 0,
                        cancelled: 0,
                        total: 0
                    };
                }
                trialConversionMap[plan.name].total++;
                if (o.subscription_status === 'active') trialConversionMap[plan.name].converted++;
                else if (o.subscription_status === 'trial') trialConversionMap[plan.name].still_in_trial++;
                else if (o.subscription_status === 'cancelled') trialConversionMap[plan.name].cancelled++;
            });

            const trialConversion = Object.values(trialConversionMap);
            const totalTrials = trialConversion.reduce((sum, t) => sum + t.total, 0);
            const totalConverted = trialConversion.reduce((sum, t) => sum + t.converted, 0);
            const conversionRate = totalTrials > 0 ? (totalConverted / totalTrials) * 100 : 0;

            // Net growth
            const newOrgs = filteredOrgs.length;
            const cancelledOrgs = organizations.filter(o => {
                if (o.subscription_status !== 'cancelled') return false;
                const updated = new Date(o.updated_at || o.created_at);
                return updated >= startDate;
            }).length;

            return {
                period_days: days,
                daily_signups: Object.values(dailyMap).sort((a, b) => a.date.localeCompare(b.date)),
                signups_by_plan: Object.values(signupsByPlanMap),
                trial_conversion: trialConversion,
                conversion_rate_percent: Math.round(conversionRate * 100) / 100,
                net_growth: newOrgs - cancelledOrgs,
                new_organizations: newOrgs,
                cancelled_organizations: cancelledOrgs
            };
        } catch (error) {
            console.error('Get growth metrics error:', error);
            return null;
        }
    }

    /**
     * Get organization health metrics
     */
    async getOrganizationHealth() {
        try {
            // Get organizations and plans
            const organizations = await db.query('organizations', {
                select: 'id, subscription_status, trial_ends_at, created_at, updated_at'
            });

            const now = new Date();
            const thirtyDaysAgo = new Date(now - 30 * 24 * 60 * 60 * 1000);

            // At risk (trial ending in 7 days)
            const sevenDaysFromNow = new Date(now);
            sevenDaysFromNow.setDate(sevenDaysFromNow.getDate() + 7);
            
            const atRisk = organizations.filter(o => {
                if (o.subscription_status !== 'trial') return false;
                const trialEnds = new Date(o.trial_ends_at);
                return trialEnds <= sevenDaysFromNow && trialEnds >= now;
            }).length;

            // Past due
            const pastDue = organizations.filter(o => {
                if (o.subscription_status === 'trial') return false;
                // Simplified - would need billing data for accurate past due
                return false;
            }).length;

            // Inactive (no activity in 30 days)
            const inactive = organizations.filter(o => {
                const updated = new Date(o.updated_at || o.created_at);
                return updated < thirtyDaysAgo;
            }).length;

            // Active users (updated in last 30 days)
            const active = organizations.filter(o => {
                const updated = new Date(o.updated_at || o.created_at);
                return updated >= thirtyDaysAgo;
            }).length;

            return {
                at_risk: atRisk,
                past_due: pastDue,
                inactive: inactive,
                active: active
            };
        } catch (error) {
            console.error('Get organization health error:', error);
            return null;
        }
    }
}

module.exports = new AnalyticsService();
