# Environment Variables Setup

Create a `.env` file in the root directory with the following variables:

```env
# Server Configuration
PORT=3000
NODE_ENV=development

# Database Configuration
DATABASE_URL=postgresql://user:password@localhost:5432/facebook_importer

# Encryption Key (64 hex characters = 32 bytes)
# Generate with: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
ENCRYPTION_KEY=your-64-character-hex-encryption-key-here

# Logto Configuration
LOGTO_ENDPOINT=https://your-logto-instance.com
LOGTO_APP_ID=your-logto-app-id
LOGTO_APP_SECRET=your-logto-app-secret
# LOGTO_API_RESOURCE (optional): Resource indicator for M2M tokens and userinfo. Must match an API resource in Logto. Default: {LOGTO_ENDPOINT}/api. Override if your Logto uses a different resource (e.g. https://default.logto.app/api).

# Facebook OAuth Configuration
FACEBOOK_APP_ID=your-facebook-app-id
FACEBOOK_APP_SECRET=your-facebook-app-secret
FACEBOOK_REDIRECT_URI=http://localhost:3000/facebook/callback
FACEBOOK_TOKEN_REFRESH_THRESHOLD_DAYS=7

# Cron Configuration (optional, defaults to every 5 minutes)
CRON_INTERVAL=*/5 * * * *
```

## Generating Encryption Key

To generate a secure encryption key, run:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Copy the output and use it as your `ENCRYPTION_KEY` value.

## Facebook App Setup

1. Go to [Facebook Developers](https://developers.facebook.com/)
2. Create a new app or select an existing one
3. Add "Facebook Login" product
4. Configure OAuth Redirect URIs:
   - Add your callback URL: `http://localhost:3000/facebook/callback` (for development)
   - Add your production callback URL when deploying
5. Request the following permissions:
   - `pages_read_engagement`
   - `pages_read_user_content`
   - `pages_show_list`
6. Copy the App ID and App Secret to your `.env` file

**Token Refresh Configuration:**
- `FACEBOOK_TOKEN_REFRESH_THRESHOLD_DAYS` (optional, default: 7) - Number of days before token expiration to automatically refresh the token. The system will refresh tokens proactively to prevent expiration and ensure seamless operation.

## Database Setup

Make sure PostgreSQL is running and create a database:

```sql
CREATE DATABASE facebook_importer;
```

The application will automatically create the necessary tables on first run (in development mode).

## Logto Setup

1. In your Logto admin console, create or select an application
2. Note the **Application ID** and **Application Secret** (M2M credentials)
3. Ensure the application has the following permissions:
   - `read:user` - To read user information
   - `read:organization` - To read organization information (for multi-tenant)
4. Configure the application to allow token introspection
5. Copy the **Endpoint URL**, **Application ID**, and **Application Secret** to your `.env` file

**Note:** The API validates access tokens via Logto's userinfo endpoint. Make sure your Logto application is configured for machine-to-machine authentication. If you use a custom API resource for token validation, set `LOGTO_API_RESOURCE` to match the resource indicator registered in Logto Console (API resources).
