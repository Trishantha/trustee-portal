/**
 * Reset admin password
 */

const { createClient } = require('@supabase/supabase-js');
const bcrypt = require('bcryptjs');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Error: SUPABASE_URL and SUPABASE_SERVICE_KEY environment variables are required');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { autoRefreshToken: false, persistSession: false }
});

async function resetPassword() {
  const email = 'admin@trusteeportal.com';
  const newPassword = 'Admin123!';
  
  try {
    const passwordHash = await bcrypt.hash(newPassword, 12);
    
    const { data, error } = await supabase
      .from('users')
      .update({ password_hash: passwordHash })
      .eq('email', email)
      .select('email')
      .single();
    
    if (error) {
      console.error('Error:', error);
      return;
    }
    
    console.log('✅ Password reset for:', data.email);
    console.log('New password:', newPassword);
    
  } catch (err) {
    console.error('Error:', err);
  }
}

resetPassword();
