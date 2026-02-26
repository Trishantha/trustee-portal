# Client ID System Documentation

## Overview
The Client ID System generates unique 12-character alphanumeric identifiers for each organization. This ID serves as the primary reference throughout the platform.

## Client ID Format
- **Length**: 12 characters
- **Format**: Alphanumeric (A-Z, 2-9)
- **Display Format**: Grouped with hyphens for readability (e.g., `ABC-DEF-GHI-JKL`)
- **Excluded Characters**: 0, O, 1, I, L (to avoid confusion)

## Example Client IDs
```
ABC-DEF-GHI-JKL
X7M-P2K-9NQ-R4T
H8J-K2M-N5P-Q9R
```

## Database Schema

### Organizations Table
```sql
client_id TEXT UNIQUE NOT NULL
```

### Index
```sql
CREATE INDEX idx_organizations_client_id ON organizations(client_id);
```

## API Endpoints

### Create Organization (Auto-generates Client ID)
```http
POST /api/organizations
```
Response includes:
```json
{
  "organization": {
    "id": 123,
    "client_id": "ABC-DEF-GHI-JKL",
    "client_id_formatted": "ABC-DEF-GHI-JKL"
  }
}
```

### Get Organization by Client ID (Platform Admin)
```http
GET /api/platform/organizations/by-client-id/:clientId
```

### List Organizations (includes client_id)
```http
GET /api/platform/organizations
```

## Frontend Usage

### Search by Client ID
The client list search now supports Client ID lookup:
- Search by formatted ID: `ABC-DEF-GHI-JKL`
- Search by raw ID: `ABCDEFGHIJKL`
- Partial matches work as well

### Display Format
Client IDs are displayed in the format `ABC-DEF-GHI-JKL` throughout the platform.

## Implementation Files

### Backend
- `backend/utils/clientId.js` - Client ID generation and validation utilities
- `backend/routes/organizations.js` - Auto-assigns client_id on creation
- `backend/routes/platform-admin.js` - Client ID lookup endpoints

### Database Migrations
- `backend/scripts/add-client-id-system.sql` - Standalone migration
- `backend/scripts/fix-supabase-schema.sql` - Updated with client_id support
- `backend/database/supabase-schema.sql` - Updated schema with client_id

### Frontend
- `js/platform-admin.js` - Displays client_id in client list and view modal
- `modules/platform-admin.html` - Updated search placeholder

## Setup Instructions

### 1. Run Database Migration
Execute this SQL in Supabase SQL Editor:

```sql
-- Add client_id column
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS client_id TEXT UNIQUE;

-- Create index
CREATE INDEX IF NOT EXISTS idx_organizations_client_id ON organizations(client_id);

-- Generate client IDs for existing organizations
DO $$
DECLARE
    org RECORD;
    new_client_id TEXT;
    id_exists BOOLEAN;
BEGIN
    FOR org IN SELECT id FROM organizations WHERE client_id IS NULL
    LOOP
        LOOP
            new_client_id := upper(substring('ABCDEFGHJKMNPQRSTUVWXYZ23456789' from (floor(random() * 32) + 1)::int for 1));
            new_client_id := new_client_id || upper(substring('ABCDEFGHJKMNPQRSTUVWXYZ23456789' from (floor(random() * 32) + 1)::int for 1));
            new_client_id := new_client_id || upper(substring('ABCDEFGHJKMNPQRSTUVWXYZ23456789' from (floor(random() * 32) + 1)::int for 1));
            new_client_id := new_client_id || upper(substring('ABCDEFGHJKMNPQRSTUVWXYZ23456789' from (floor(random() * 32) + 1)::int for 1));
            new_client_id := new_client_id || upper(substring('ABCDEFGHJKMNPQRSTUVWXYZ23456789' from (floor(random() * 32) + 1)::int for 1));
            new_client_id := new_client_id || upper(substring('ABCDEFGHJKMNPQRSTUVWXYZ23456789' from (floor(random() * 32) + 1)::int for 1));
            new_client_id := new_client_id || upper(substring('ABCDEFGHJKMNPQRSTUVWXYZ23456789' from (floor(random() * 32) + 1)::int for 1));
            new_client_id := new_client_id || upper(substring('ABCDEFGHJKMNPQRSTUVWXYZ23456789' from (floor(random() * 32) + 1)::int for 1));
            new_client_id := new_client_id || upper(substring('ABCDEFGHJKMNPQRSTUVWXYZ23456789' from (floor(random() * 32) + 1)::int for 1));
            new_client_id := new_client_id || upper(substring('ABCDEFGHJKMNPQRSTUVWXYZ23456789' from (floor(random() * 32) + 1)::int for 1));
            new_client_id := new_client_id || upper(substring('ABCDEFGHJKMNPQRSTUVWXYZ23456789' from (floor(random() * 32) + 1)::int for 1));
            new_client_id := new_client_id || upper(substring('ABCDEFGHJKMNPQRSTUVWXYZ23456789' from (floor(random() * 32) + 1)::int for 1));
            
            SELECT EXISTS(SELECT 1 FROM organizations WHERE client_id = new_client_id) INTO id_exists;
            EXIT WHEN NOT id_exists;
        END LOOP;
        
        UPDATE organizations SET client_id = new_client_id WHERE id = org.id;
    END LOOP;
END $$;

-- Make NOT NULL after population
ALTER TABLE organizations ALTER COLUMN client_id SET NOT NULL;
```

Or simply run:
```bash
cd backend/scripts
psql -U your_user -d your_db -f add-client-id-system.sql
```

### 2. Restart Backend Server
The client ID generation will automatically work for new organizations.

## Utility Functions

### Generate Unique Client ID
```javascript
const { generateUniqueClientId } = require('./utils/clientId');
const clientId = await generateUniqueClientId();
// Returns: "X7MP2K9NQR4T"
```

### Format Client ID
```javascript
const { formatClientId } = require('./utils/clientId');
const formatted = formatClientId('X7MP2K9NQR4T');
// Returns: "X7M-P2K-9NQ-R4T"
```

### Validate Client ID
```javascript
const { isValidClientId } = require('./utils/clientId');
const isValid = isValidClientId('X7MP2K9NQR4T');
// Returns: true
```

### Normalize Client ID
```javascript
const { normalizeClientId } = require('./utils/clientId');
const normalized = normalizeClientId('x7m-p2k-9nq-r4t');
// Returns: "X7MP2K9NQR4T"
```

## Collision Handling
The system automatically handles collisions by:
1. Generating a random 12-character ID
2. Checking if it exists in the database
3. If collision detected, retry up to 10 times
4. Throw error if all attempts fail (extremely rare)

## Security Considerations
- Client IDs are unique and non-sequential (unlike numeric IDs)
- Cannot be easily guessed or enumerated
- Used as the primary public reference for organizations
- Internal numeric IDs are still used for database relationships
