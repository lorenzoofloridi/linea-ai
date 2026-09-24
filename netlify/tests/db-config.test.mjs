import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFile, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { connectionOptions, describeConnection, DatabaseConfigError } from '../lib/db.mjs';

const PEM = '-----BEGIN CERTIFICATE-----\nMIIBfake\n-----END CERTIFICATE-----\n';
const REMOTE = 'postgresql://postgres.abc:s3gr3ta@aws-0-eu-central-1.pooler.supabase.com:6543/postgres?sslmode=require';

test('remote database requires a CA and always verifies the certificate', () => {
  assert.throws(() => connectionOptions(REMOTE, {}), e => e instanceof DatabaseConfigError && e.code === 'DATABASE_CA_MISSING');
  const options = connectionOptions(REMOTE, { LINEA_DATABASE_CA: PEM.replace(/\n/g, '\\n') });
  assert.deepEqual(options.ssl, { ca: PEM, rejectUnauthorized: true });
  assert.ok(!options.connectionString.includes('sslmode'), 'sslmode must not override ssl options');
});

test('CA can be read from a file (Mac migrations)', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'ca-'));
  const file = path.join(dir, 'prod-ca.crt');
  await writeFile(file, PEM);
  assert.equal(connectionOptions(REMOTE, { LINEA_DATABASE_CA_FILE: file }).ssl.ca, PEM);
  assert.throws(() => connectionOptions(REMOTE, { LINEA_DATABASE_CA_FILE: file + '.missing' }), e => e.code === 'DATABASE_CA_UNREADABLE');
});

test('local database for tests needs no TLS', () => {
  assert.deepEqual(connectionOptions('postgres://postgres@localhost:5432/t', {}), { connectionString: 'postgres://postgres@localhost:5432/t' });
});

test('errors and diagnostics never contain the password', () => {
  for (const [url, code] of [[undefined, 'DATABASE_NOT_CONFIGURED'], ['non-url', 'DATABASE_URL_INVALID'], ['mysql://u:s3gr3ta@h/db', 'DATABASE_URL_INVALID']]) {
    assert.throws(() => connectionOptions(url, {}), e => e.code === code && !String(e.message).includes('s3gr3ta'));
  }
  assert.equal(describeConnection(REMOTE), 'aws-0-eu-central-1.pooler.supabase.com:6543');
});
