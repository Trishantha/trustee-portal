# Setup Wizard Troubleshooting

## "Failed to Update Organization" Error

### Quick Fix - Run SQL Migration

The most likely cause is missing database columns. Run this SQL in your Supabase SQL Editor:

```sql
-- Add missing columns for setup wizard
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS billing_email TEXT;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS billing_address TEXT;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS website_url TEXT;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS slug TEXT;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS custom_domain TEXT;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS primary_color TEXT;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS secondary_color TEXT;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS default_term_length INTEGER DEFAULT 3;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS max_consecutive_terms INTEGER DEFAULT 2;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS renewal_notification_days INTEGER DEFAULT 90;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS auto_renewal_policy TEXT DEFAULT 'chair_approval';
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS enable_term_tracking BOOLEAN DEFAULT TRUE;
```

### Debug Steps

1. **Open Browser Console (F12)**
   - Look for red error messages
   - Check for logs starting with "saveStep1"

2. **Test the API Directly**
   Run this in the browser console:
   ```javascript
   debugTestOrgUpdate();
   ```

3. **Force Skip to Step 2** (temporary workaround)
   Run this in the browser console:
   ```javascript
   debugForceStep2();
   ```

4. **Check Network Tab**
   - Open Network tab in DevTools
   - Look for PUT request to `/api/organizations/{id}`
   - Check the response for detailed error

### Common Issues

#### 1. Missing Database Columns
**Error:** Column doesn't exist
**Fix:** Run the SQL migration above

#### 2. Permission Denied
**Error:** "Not a member of this organization" or "Insufficient permissions"
**Fix:** Make sure you're logged in as the organization owner

#### 3. Backend Not Running
**Error:** "Server returned non-JSON response"
**Fix:** Start the backend server:
```bash
cd backend
npm start
```

#### 4. Column Name Mismatch
The backend now handles multiple column name formats:
- `billing_email` → `contact_email`
- `website_url` → `website`
- `slug` → `subdomain`
- etc.

### Manual Workaround

If you can't fix the issue immediately, you can:

1. Skip the wizard (click "Skip for now")
2. Go to Admin → System Settings
3. Configure your organization manually

### Check Organization Data

Run this in browser console to see your current organization:
```javascript
const org = JSON.parse(localStorage.getItem('current_organization'));
console.log(org);
```

### Reset and Try Again

```javascript
// Clear setup completion flag
const org = JSON.parse(localStorage.getItem('current_organization'));
if (org) {
    localStorage.removeItem(`setupCompleted_${org.id}`);
}
location.reload();
```
