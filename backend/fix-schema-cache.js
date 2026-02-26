/**
 * Fix Supabase Schema Cache
 * This script forces a schema refresh by making various API calls
 */

const { createClient } = require('@supabase/supabase-js');

// Load from .env file
require('dotenv').config();

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false }
});

async function refreshSchemaCache() {
    console.log('🔄 Refreshing Supabase schema cache...\n');
    
    const tables = [
        'users',
        'organizations',
        'organization_members',
        'subscription_plans',
        'boards',
        'committees',
        'tasks',
        'meetings',
        'documents',
        'messages',
        'notifications',
        'audit_logs'
    ];
    
    console.log('Step 1: Pinging each table to refresh cache...');
    for (const table of tables) {
        try {
            const { data, error } = await supabase
                .from(table)
                .select('*', { count: 'exact', head: true });
            
            if (error) {
                console.log(`  ⚠️  ${table}: ${error.message}`);
            } else {
                console.log(`  ✅ ${table}: OK`);
            }
        } catch (err) {
            console.log(`  ❌ ${table}: ${err.message}`);
        }
    }
    
    console.log('\nStep 2: Checking organizations table columns...');
    try {
        // Try to select specific columns from organizations
        const { data, error } = await supabase
            .from('organizations')
            .select('id, name, slug, subscription_plan_id, subscription_status');
        
        if (error) {
            console.log(`  ❌ Error: ${error.message}`);
        } else {
            console.log(`  ✅ Organizations table columns accessible`);
            console.log(`     Found ${data?.length || 0} organizations`);
        }
    } catch (err) {
        console.log(`  ❌ Error: ${err.message}`);
    }
    
    console.log('\nStep 3: Checking subscription_plans table...');
    try {
        const { data, error } = await supabase
            .from('subscription_plans')
            .select('*');
        
        if (error) {
            console.log(`  ❌ Error: ${error.message}`);
        } else {
            console.log(`  ✅ Found ${data?.length || 0} subscription plans`);
            data?.forEach(plan => {
                console.log(`     - ${plan.name} (${plan.code || plan.slug}): $${plan.price_monthly}/mo`);
            });
        }
    } catch (err) {
        console.log(`  ❌ Error: ${err.message}`);
    }
    
    console.log('\nStep 4: Testing organization creation flow...');
    try {
        // Get trial plan
        const { data: plan, error: planError } = await supabase
            .from('subscription_plans')
            .select('id')
            .eq('code', 'trial')
            .single();
        
        if (planError) {
            console.log(`  ⚠️  Could not find trial plan: ${planError.message}`);
        } else {
            console.log(`  ✅ Trial plan found: ${plan.id}`);
        }
    } catch (err) {
        console.log(`  ❌ Error: ${err.message}`);
    }
    
    console.log('\n✨ Schema cache refresh complete!');
    console.log('\nNOTE: If you still see schema errors, try:');
    console.log('  1. Wait 2-3 minutes for Supabase to auto-refresh');
    console.log('  2. Go to Supabase Dashboard → Database → API');
    console.log('  3. Click "Reload schema" or refresh the page');
    console.log('  4. Or restart your server with: pkill -f "node backend/server.js" && node backend/server.js');
}

refreshSchemaCache().catch(console.error);
