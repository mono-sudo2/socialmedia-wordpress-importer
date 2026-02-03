#!/usr/bin/env ts-node

import * as crypto from 'crypto';
import { Client } from 'pg';
import * as dotenv from 'dotenv';
import * as path from 'path';

// Load environment variables
dotenv.config({ path: path.join(__dirname, '..', '.env') });

interface CliArgs {
  logtoOrgId: string;
  facebookUserId: string;
  accessToken: string;
  pageId?: string;
  expiresInDays?: number;
}

function parseArgs(): CliArgs {
  const args = process.argv.slice(2);
  const parsed: any = {};

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg.startsWith('--')) {
      const [key, value] = arg.slice(2).split('=');
      if (value) {
        parsed[key] = value;
      } else if (i + 1 < args.length && !args[i + 1].startsWith('--')) {
        parsed[key] = args[++i];
      }
    }
  }

  // Validate required arguments
  const required = ['logtoOrgId', 'facebookUserId', 'accessToken'];
  const missing = required.filter((key) => !parsed[key]);

  if (missing.length > 0) {
    console.error(`Missing required arguments: ${missing.join(', ')}`);
    console.log('\nUsage:');
    console.log(
      '  npm run seed:facebook -- --logtoOrgId=<logto-org-id> --facebookUserId=<id> --accessToken=<token> [--pageId=<id>] [--expiresInDays=<days>]',
    );
    console.log('\nExample:');
    console.log(
      '  npm run seed:facebook -- --logtoOrgId=org_abc123 --facebookUserId=123456789 --accessToken=EAAxxxxxx --pageId=987654321',
    );
    process.exit(1);
  }

  return {
    logtoOrgId: parsed.logtoOrgId,
    facebookUserId: parsed.facebookUserId,
    accessToken: parsed.accessToken,
    pageId: parsed.pageId,
    expiresInDays: parsed.expiresInDays
      ? parseInt(parsed.expiresInDays, 10)
      : 60,
  };
}

function encryptToken(accessToken: string): string {
  const encryptionKey = process.env.ENCRYPTION_KEY;

  if (!encryptionKey) {
    throw new Error('ENCRYPTION_KEY environment variable is required');
  }

  const key = Buffer.from(encryptionKey, 'hex');

  if (key.length !== 32) {
    throw new Error('ENCRYPTION_KEY must be 64 hex characters (32 bytes)');
  }

  // Use same encryption logic as encryption.service.ts
  const algorithm = 'aes-256-gcm';
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(algorithm, key, iv);

  let encrypted = cipher.update(accessToken, 'utf8', 'hex');
  encrypted += cipher.final('hex');

  const authTag = cipher.getAuthTag();

  // Combine iv, authTag, and encrypted data
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
}

async function seedConnection(args: CliArgs): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    throw new Error('DATABASE_URL environment variable is required');
  }

  const client = new Client({
    connectionString: databaseUrl,
  });

  try {
    await client.connect();
    console.log('Connected to database');

    // Encrypt access token
    console.log('Encrypting access token...');
    const encryptedAccessToken = encryptToken(args.accessToken);

    // Calculate expiration date
    const tokenExpiresAt = new Date();
    tokenExpiresAt.setDate(tokenExpiresAt.getDate() + args.expiresInDays!);

    // Generate UUID for the connection
    const connectionId = crypto.randomUUID();

    // Deactivate existing connections for this organization
    const deactivateResult = await client.query(
      'UPDATE facebook_connections SET "isActive" = false WHERE "logtoOrgId" = $1 AND "isActive" = true',
      [args.logtoOrgId],
    );

    if (deactivateResult.rowCount && deactivateResult.rowCount > 0) {
      console.log(
        `Deactivated ${deactivateResult.rowCount} existing connection(s)`,
      );
    }

    // Insert new connection
    const result = await client.query(
      `INSERT INTO facebook_connections (
        id,
        "logtoOrgId",
        "facebookUserId",
        "encryptedAccessToken",
        "pageId",
        "tokenExpiresAt",
        "isActive",
        "createdAt"
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
      RETURNING id, "facebookUserId", "pageId", "tokenExpiresAt"`,
      [
        connectionId,
        args.logtoOrgId,
        args.facebookUserId,
        encryptedAccessToken,
        args.pageId || null,
        tokenExpiresAt,
        true,
      ],
    );

    console.log('\n✅ Facebook connection created successfully!');
    console.log('Connection details:');
    console.log(`  ID: ${result.rows[0].id}`);
    console.log(`  Facebook User ID: ${result.rows[0].facebookUserId}`);
    console.log(`  Page ID: ${result.rows[0].pageId || 'N/A'}`);
    console.log(
      `  Token Expires At: ${result.rows[0].tokenExpiresAt.toISOString()}`,
    );
    console.log(
      `  Days until expiration: ${args.expiresInDays} days from now`,
    );
  } catch (error: any) {
    console.error('\n❌ Error:', error.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

// Main execution
const args = parseArgs();
seedConnection(args)
  .then(() => {
    console.log('\n✨ Done!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Fatal error:', error.message);
    process.exit(1);
  });
