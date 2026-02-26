/**
 * Create organization for admin user
 */

const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Error: SUPABASE_URL and SUPABASE_SERVICE_KEY environment variables are required');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

async function createAdminOrg() {
  const email = 'admin@trusteeportal.com';
  
  try {
    // Get admin user
    const { data: user } = await supabase
      .from('users')
      .select('*')
      .eq('email', email)
      .single();
    
    if (!user) {
      console.error('Admin user not found');
      return;
    }
    
    // Check if already has organization membership
    const { data: existingMember } = await supabase
      .from('organization_members')
      .select('*, organizations(*)')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .single();
    
    if (existingMember) {
      console.log('Admin already has organization:', existingMember.organizations.name);
      return;
    }
    
    // Create organization with required fields only
    const trialEndsAt = new Date();
    trialEndsAt.setDate(trialEndsAt.getDate() + 14);
    
    const { data: organization, error: orgError } = await supabase
      .from('organizations')
      .insert({
        client_id: `TRUSTEE-${Date.now()}`,
        name: 'Trustee Portal Admin',
        slug: 'trustee-admin',
        subscription_status: 'trial',
        trial_ends_at: trialEndsAt.toISOString(),
        max_members: 10,
        settings: {
          timezone: 'UTC',
          language: 'en'
        }
      })
      .select()
      .single();
    
    if (orgError || !organization) {
      console.error('Failed to create organization:', orgError);
      return;
    }
    
    // Create membership as OWNER
    await supabase
      .from('organization_members')
      .insert({
        organization_id: organization.id,
        user_id: user.id,
        role: 'owner',
        is_active: true,
        joined_at: new Date().toISOString()
      });
    
    console.log('✅ Organization created for admin!');
    console.log('Organization:', organization.name);
    console.log('Slug:', organization.slug);
    
  } catch (err) {
    console.error('Error:', err);
  }
}

createAdminOrg();
