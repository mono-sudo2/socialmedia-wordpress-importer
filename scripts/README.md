# Facebook Connection Seed Script

This script allows you to manually insert a Facebook connection into the database for testing purposes, bypassing the OAuth flow.

## Prerequisites

1. Install dependencies:
   ```bash
   npm install
   ```

2. Ensure your `.env` file is configured with:
   - `DATABASE_URL` - PostgreSQL connection string
   - `ENCRYPTION_KEY` - 64-character hex encryption key

## Usage

```bash
npm run seed:facebook -- \
  --logtoOrgId=<logto-org-id> \
  --facebookUserId=<facebook-user-id> \
  --accessToken=<facebook-access-token> \
  --pageId=<facebook-page-id>
```

Or use the full command:

```bash
npx ts-node scripts/seed-facebook-connection.ts \
  --logtoOrgId=org_abc123 \
  --facebookUserId=123456789 \
  --accessToken=EAAxxxxxx \
  --pageId=987654321
```

## Parameters

- `--logtoOrgId` (required) - The Logto organization ID
- `--facebookUserId` (required) - The Facebook user ID
- `--accessToken` (required) - The Facebook access token (will be encrypted automatically)
- `--pageId` (optional) - The Facebook page ID
- `--expiresInDays` (optional) - Number of days until token expires (default: 60)

## Example

```bash
npm run seed:facebook -- \
  --logtoOrgId=org_abc123xyz \
  --facebookUserId=1234567890123456 \
  --accessToken=EAAG1234567890abcdefghijklmnopqrstuvwxyz \
  --pageId=9876543210987654 \
  --expiresInDays=90
```

## What the script does

1. Loads environment variables from `.env`
2. Validates all required parameters
3. Verifies the organization exists in the database
4. Encrypts the access token using AES-256-GCM (same as the app)
5. Deactivates any existing active connections for the organization
6. Inserts the new Facebook connection
7. Prints success message with connection details

## Notes

- The script will automatically deactivate any existing active connections for the organization
- The access token is encrypted using the same method as the application
- The token expiration is set to 60 days by default (configurable)
- Make sure you have valid Facebook credentials before running the script
