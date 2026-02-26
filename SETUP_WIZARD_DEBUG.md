# Setup Wizard Debugging Guide

## Common Issues and Solutions

### Issue 1: Can't Progress to Step 2

**Symptoms:**
- Clicking "Continue" on Step 1 does nothing
- No error message shown
- Console shows no errors

**Debugging Steps:**

1. **Open Browser Console (F12)**
   - Check for JavaScript errors
   - Look for console logs starting with "saveStep1"

2. **Check Required Fields**
   - Organization Name (required)
   - Billing Email (required, must be valid format)

3. **Verify Organization Context**
   Open console and run:
   ```javascript
   const org = JSON.parse(localStorage.getItem('current_organization'));
   console.log('Current org:', org);
   ```
   Should show an object with `id` property.

4. **Check API Call**
   Look for console log:
   - "Calling organizationsAPI.update with ID: X"
   - Should be followed by "Update successful" or error

**Quick Fix - Force Continue:**
If you want to skip validation and force progress to step 2:
```javascript
goToStep(2);
```

### Issue 2: Committee Creation Fails (Step 2)

**Symptoms:**
- Error message: "Failed to create committees"
- Console shows 403 or 500 error

**Debugging Steps:**

1. **Check X-Organization-ID Header**
   Open console and run:
   ```javascript
   const org = JSON.parse(localStorage.getItem('current_organization'));
   console.log('Org ID for header:', org?.id);
   ```

2. **Verify Membership**
   Ensure you're an owner or admin of the organization.

3. **Check Network Tab**
   - Open Network tab in DevTools
   - Look for POST request to `/api/committees`
   - Check response status and message

### Issue 3: Nothing Happens After Clicking Continue

**Most Likely Cause:** JavaScript error preventing execution

**Fix:**
1. Open browser console (F12)
2. Look for red error messages
3. Common issues:
   - `authAPI is not defined` → Refresh page to load API module
   - `Cannot read property 'id' of null` → Not logged in or org not selected
   - `goToStep is not defined` → JavaScript not loaded properly

## Testing the Setup Wizard

### Reset Setup (Start Over)
Run in console:
```javascript
const org = JSON.parse(localStorage.getItem('current_organization'));
if (org) {
    localStorage.removeItem(`setupCompleted_${org.id}`);
    location.reload();
}
```

### Debug Mode (Force Show Wizard)
Run in console:
```javascript
debugShowWizard();
```

### Manual Step Navigation
Run in console:
```javascript
goToStep(2);  // Go to step 2
goToStep(3);  // Go to step 3
goToStep(4);  // Go to completion
```

## Recent Fixes Applied

1. **Added X-Organization-ID Header**
   - API client now automatically includes organization ID in requests
   - Required for committees API to work

2. **Simplified Organization Update Route**
   - Removed strict tenant middleware requirement
   - Now checks membership directly

3. **Added Debug Logging**
   - Console logs at each step of saveStep1 and saveStep2
   - Easier to identify where the process fails

4. **Better Error Messages**
   - Specific validation errors for missing fields
   - Focus on first invalid field

## Still Not Working?

1. **Clear Browser Cache**
   - Hard refresh: Ctrl+F5 (Windows) or Cmd+Shift+R (Mac)

2. **Restart Backend Server**
   ```bash
   cd /workspaces/trustee-portal/backend
   npm start
   ```

3. **Check Database Connection**
   - Verify backend can connect to database
   - Check for organization records in database

4. **Test API Directly**
   ```bash
   curl -X PUT http://localhost:3001/api/organizations/1 \
     -H "Content-Type: application/json" \
     -H "Authorization: Bearer YOUR_TOKEN" \
     -H "X-Organization-ID: 1" \
     -d '{"name":"Test Org","billing_email":"test@test.com"}'
   ```
