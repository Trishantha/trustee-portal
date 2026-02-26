#!/usr/bin/env node
/**
 * Trustee Portal Health Check Script
 * Checks database connection, required tables, and configuration
 */

// Load environment variables
require('dotenv').config();

const { supabaseAdmin } = require('../config/supabase');

const REQUIRED_TABLES = [
    'users',
    'organizations',
    'organization_members',
    'boards',
    'board_members',
    'committees',
    'committee_members',
    'subscription_plans',
    'activity_logs',
    'document_folders',
    'documents',
    'notifications',
    'audit_log',
    'tasks',
    'meetings',
    'meeting_attendees',
    'conversations',
    'messages',
    'job_openings',
    'applications',
    'shortlisted_candidates',
    'selected_candidates'
];

const REQUIRED_COLUMNS = {
    'organizations': ['subscription_plan_id', 'trial_ends_at', 'subscription_status', 'stripe_customer_id'],
    'users': ['is_active', 'avatar', 'is_super_admin']
};

async function checkTableExists(tableName) {
    try {
        const { data, error } = await supabaseAdmin
            .from(tableName)
            .select('*')
            .limit(1);
        
        if (error && error.code === 'PGRST205') {
            return { exists: false, error: error.message };
        }
        return { exists: true, error: null };
    } catch (error) {
        return { exists: false, error: error.message };
    }
}

async function checkColumnExists(tableName, columnName) {
    try {
        const { data, error } = await supabaseAdmin
            .rpc('check_column_exists', { 
                p_table: tableName, 
                p_column: columnName 
            });
        
        // If the RPC doesn't exist, try a different approach
        if (error && error.message.includes('function')) {
            // Just try to query the column
            const { error: queryError } = await supabaseAdmin
                .from(tableName)
                .select(columnName)
                .limit(1);
            return { exists: !queryError || !queryError.message.includes(columnName), error: queryError };
        }
        
        return { exists: data === true, error };
    } catch (error) {
        return { exists: false, error: error.message };
    }
}

async function runHealthCheck() {
    console.log('\n╔══════════════════════════════════════════════════════════════╗');
    console.log('║                                                              ║');
    console.log('║         🏛️  Trustee Portal Health Check                     ║');
    console.log('║                                                              ║');
    console.log('╚══════════════════════════════════════════════════════════════╝\n');
    
    let issues = [];
    let warnings = [];
    
    // 1. Check database connection
    console.log('📡 Checking database connection...');
    try {
        const { data, error } = await supabaseAdmin.from('users').select('count').limit(1);
        if (error) {
            console.log('   ❌ Database connection failed:', error.message);
            issues.push({ type: 'CRITICAL', message: 'Database connection failed: ' + error.message });
        } else {
            console.log('   ✅ Database connection OK');
        }
    } catch (error) {
        console.log('   ❌ Database connection error:', error.message);
        issues.push({ type: 'CRITICAL', message: 'Database connection error: ' + error.message });
    }
    
    // 2. Check required tables
    console.log('\n📋 Checking required tables...');
    for (const table of REQUIRED_TABLES) {
        const { exists, error } = await checkTableExists(table);
        if (exists) {
            console.log(`   ✅ ${table}`);
        } else {
            console.log(`   ❌ ${table} - MISSING`);
            issues.push({ type: 'ERROR', message: `Missing table: ${table}` });
        }
    }
    
    // 3. Check environment variables
    console.log('\n🔧 Checking environment variables...');
    const requiredEnvVars = [
        'SUPABASE_URL',
        'SUPABASE_SERVICE_KEY',
        'SUPABASE_ANON_KEY',
        'JWT_SECRET'
    ];
    
    for (const envVar of requiredEnvVars) {
        if (process.env[envVar]) {
            // Mask sensitive values
            const value = process.env[envVar];
            const masked = value.length > 20 
                ? value.substring(0, 10) + '...' + value.substring(value.length - 5)
                : '***';
            console.log(`   ✅ ${envVar}: ${masked}`);
        } else {
            console.log(`   ❌ ${envVar}: NOT SET`);
            issues.push({ type: 'ERROR', message: `Missing environment variable: ${envVar}` });
        }
    }
    
    // 4. Check optional but recommended variables
    const optionalEnvVars = [
        'STRIPE_SECRET_KEY',
        'STRIPE_PUBLISHABLE_KEY',
        'SMTP_HOST',
        'SMTP_USER'
    ];
    
    for (const envVar of optionalEnvVars) {
        if (process.env[envVar]) {
            console.log(`   ✅ ${envVar}: Set`);
        } else {
            console.log(`   ⚠️  ${envVar}: Not set (optional)`);
            warnings.push({ type: 'WARNING', message: `Optional variable not set: ${envVar}` });
        }
    }
    
    // 5. Check for common configuration issues
    console.log('\n🔍 Checking configuration...');
    
    // Check JWT secret
    const jwtSecret = process.env.JWT_SECRET;
    if (jwtSecret && (jwtSecret.includes('change') || jwtSecret.includes('secret') || jwtSecret.length < 20)) {
        console.log('   ⚠️  JWT_SECRET appears to be using default/weak value');
        warnings.push({ type: 'SECURITY', message: 'JWT_SECRET is using a weak/default value' });
    } else if (jwtSecret) {
        console.log('   ✅ JWT_SECRET looks secure');
    }
    
    // Check Stripe keys format
    const stripeKey = process.env.STRIPE_PUBLISHABLE_KEY;
    if (stripeKey) {
        if (stripeKey.includes('pk_testpk_test')) {
            console.log('   ❌ STRIPE_PUBLISHABLE_KEY has duplication issue');
            issues.push({ type: 'CONFIG', message: 'STRIPE_PUBLISHABLE_KEY has duplication (pk_testpk_test)' });
        } else if (!stripeKey.startsWith('pk_test_') && !stripeKey.startsWith('pk_live_')) {
            console.log('   ⚠️  STRIPE_PUBLISHABLE_KEY format looks incorrect');
            warnings.push({ type: 'CONFIG', message: 'STRIPE_PUBLISHABLE_KEY format looks incorrect' });
        } else {
            console.log('   ✅ STRIPE_PUBLISHABLE_KEY format looks correct');
        }
    }
    
    // 6. Summary
    console.log('\n╔══════════════════════════════════════════════════════════════╗');
    console.log('║                         SUMMARY                              ║');
    console.log('╚══════════════════════════════════════════════════════════════╝\n');
    
    const criticalIssues = issues.filter(i => i.type === 'CRITICAL');
    const errors = issues.filter(i => i.type === 'ERROR' || i.type === 'CONFIG');
    
    if (criticalIssues.length === 0 && errors.length === 0 && warnings.length === 0) {
        console.log('✅ All checks passed! System is healthy.\n');
        process.exit(0);
    } else {
        if (criticalIssues.length > 0) {
            console.log(`❌ ${criticalIssues.length} CRITICAL issue(s):`);
            criticalIssues.forEach(i => console.log(`   - ${i.message}`));
            console.log('');
        }
        
        if (errors.length > 0) {
            console.log(`❌ ${errors.length} error(s):`);
            errors.forEach(i => console.log(`   - ${i.message}`));
            console.log('');
        }
        
        if (warnings.length > 0) {
            console.log(`⚠️  ${warnings.length} warning(s):`);
            warnings.forEach(w => console.log(`   - ${w.message}`));
            console.log('');
        }
        
        if (criticalIssues.length > 0) {
            console.log('🚨 CRITICAL issues must be fixed before the system can run properly.\n');
            process.exit(1);
        } else if (errors.length > 0) {
            console.log('⚠️  Errors should be fixed for full functionality.\n');
            process.exit(2);
        } else {
            console.log('✅ System will run but with limited functionality.\n');
            process.exit(0);
        }
    }
}

// Run the health check
runHealthCheck().catch(error => {
    console.error('\n❌ Health check failed:', error.message);
    process.exit(1);
});
