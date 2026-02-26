/**
 * Make user a super admin
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

async function makeSuperAdmin() {
  const email = 'admin@trusteeportal.com';
  
  try {
    const { data, error } = await supabase
      .from('users')
      .update({
        is_super_admin: true,
        email_verified: true
      })
      .eq('email', email)
      .select()
      .single();
    
    if (error) {
      console.error('Error:', error);
      return;
    }
    
    console.log('✅ User updated to Super Admin!');
    console.log('Email:', data.email);
    console.log('isSuperAdmin:', data.is_super_admin);
    
  } catch (err) {
    console.error('Error:', err);
  }
}

makeSuperAdmin();
