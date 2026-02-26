require('dotenv').config({ path: './backend/.env' });

async function checkSchema() {
    try {
        const response = await fetch(`${process.env.SUPABASE_URL}/rest/v1/`, {
            headers: {
                'apikey': process.env.SUPABASE_ANON_KEY,
                'Authorization': `Bearer ${process.env.SUPABASE_ANON_KEY}`
            }
        });
        const data = await response.json();
        console.log('Available tables:', Object.keys(data.definitions || {}));
        
        if (data.definitions?.organizations) {
            console.log('\nOrganizations columns:');
            console.log(Object.keys(data.definitions.organizations.properties || {}).join(', '));
        }
    } catch (e) {
        console.error('Error:', e.message);
    }
}

checkSchema();
