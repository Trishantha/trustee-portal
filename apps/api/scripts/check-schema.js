/**
 * Check database schema
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

async function checkSchema() {
  try {
    // Try to get one row to see what columns exist
    const { data, error } = await supabase
      .from('organizations')
      .select('*')
      .limit(1);
    
    if (error) {
      console.error('Error:', error);
      return;
    }
    
    if (data && data.length > 0) {
      console.log('Organization columns:', Object.keys(data[0]));
    } else {
      console.log('No organizations found, trying to insert minimal record...');
      
      // Try minimal insert
      const { data: insertData, error: insertError } = await supabase
        .from('organizations')
        .insert({ name: 'Test Org' })
        .select()
        .single();
      
      if (insertError) {
        console.error('Insert error:', insertError);
      } else {
        console.log('Created test org with columns:', Object.keys(insertData));
        // Clean up
        await supabase.from('organizations').delete().eq('id', insertData.id);
      }
    }
    
    // Also check users
    const { data: userData } = await supabase.from('users').select('*').limit(1);
    if (userData && userData.length > 0) {
      console.log('\nUser columns:', Object.keys(userData[0]));
    }
    
  } catch (err) {
    console.error('Error:', err);
  }
}

checkSchema();
