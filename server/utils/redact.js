/**
 * server/utils/redact.js
 * Scrubs sensitive fields from objects before they are written to audit logs.
 * Rules:
 *  - Never log: authorization, password, token, secret, credential, oauth,
 *    phone, email, ssn, dob, contact, owner_name fields
 *  - Truncate body values that are long strings (potential PII in freeform fields)
 *  - Deep-copies input, never mutates original
 */

const BLOCKED_KEYS = new Set([
  'authorization', 'password', 'token', 'secret', 'credential', 'oauth',
  'access_token', 'refresh_token', 'id_token', 'client_secret', 'api_key',
  'phone', 'email', 'ssn', 'dob', 'contact', 'owner_name', 'ownerName',
  'mailing', 'offerText', 'body', // email body may contain PII
]);

const TRUNCATE_THRESHOLD = 120; // characters

/**
 * Recursively redact sensitive keys from a plain object or array.
 * @param {*} value
 * @param {number} depth  – max recursion depth (guards against circular refs)
 * @returns redacted clone
 */
export function redact(value, depth = 6) {
  if (depth === 0) return '[DEPTH_LIMIT]';
  if (value === null || value === undefined) return value;
  if (Array.isArray(value)) {
    return value.slice(0, 20).map(v => redact(v, depth - 1)); // cap array length
  }
  if (typeof value === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      const lk = k.toLowerCase();
      if (BLOCKED_KEYS.has(lk) || [...BLOCKED_KEYS].some(b => lk.includes(b))) {
        out[k] = '[REDACTED]';
      } else if (typeof v === 'string' && v.length > TRUNCATE_THRESHOLD) {
        out[k] = v.slice(0, TRUNCATE_THRESHOLD) + '…[truncated]';
      } else {
        out[k] = redact(v, depth - 1);
      }
    }
    return out;
  }
  // Primitive – truncate very long strings
  if (typeof value === 'string' && value.length > TRUNCATE_THRESHOLD) {
    return value.slice(0, TRUNCATE_THRESHOLD) + '…[truncated]';
  }
  return value;
}

/**
 * Build a structured audit event.
 * @param {object} opts
 * @param {string} opts.actor   – who performed the action (e.g. 'system', 'demo-user')
 * @param {string} opts.action  – what they did   (e.g. 'discovery.run', 'email.draft')
 * @param {string} opts.resource – what resource   (e.g. 'properties', 'prop-123')
 * @param {string} [opts.status] – 'ok' | 'error' | 'pending' | 'approved'
 * @param {object} [opts.meta]  – additional safe metadata (will be redacted)
 * @returns {object} structured log entry
 */
export function buildAuditEvent({ actor, action, resource, status = 'ok', meta = {} }) {
  return {
    timestamp: new Date().toISOString(),
    actor: String(actor).slice(0, 80),
    action: String(action).slice(0, 80),
    resource: String(resource).slice(0, 200),
    status,
    meta: redact(meta),
  };
}
