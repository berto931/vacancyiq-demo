/**
 * server/index.js — VacancyIQ demo backend
 *
 * All integrations (discovery, enrichment, Gmail, offer generation) are
 * SIMULATED. No real vendor calls, no scraping, no real email sent, no charges.
 *
 * Audit log: structured events with redaction — no credentials, tokens, contact
 * data, OAuth fields, or free-form body text is ever written to the log.
 */

import express from 'express';
import cors from 'cors';
import jwt from 'jsonwebtoken';
import cron from 'node-cron';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import {
  simulateDiscovery,
  simulateAvailabilityCheck,
  deduplicateProperties,
  removeStaleProperties,
  simulateEnrichment,
  simulateGmailConnect,
  draftOutreachEmail,
  generateOffer,
} from './utils/ai.js';

import { redact, buildAuditEvent } from './utils/redact.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ─── App setup ────────────────────────────────────────────────────────────────
const app = express();
app.use(cors());
app.use(express.json({ limit: '256kb' }));

// Demo JWT secret — in real deployment use env var
const JWT_SECRET = process.env.JWT_SECRET || 'vacancyiq-demo-jwt-secret-not-for-production';

// ─── Token-issue endpoint (no auth required) ──────────────────────────────────
// Allows the frontend to obtain a demo token on load.
app.post('/api/auth/demo-token', (req, res) => {
  try {
    const token = jwt.sign({ sub: 'demo-user', role: 'buyer', demo: true }, JWT_SECRET, { expiresIn: '8h' });
    res.json({ token, expiresIn: 28800, note: '[SIMULATED] Demo token — not real authentication.' });
  } catch (e) {
    res.status(500).json({ error: 'Could not issue token' });
  }
});

// ─── Auth middleware ──────────────────────────────────────────────────────────
function requireAuth(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing token', hint: 'Call POST /api/auth/demo-token first.' });
  }
  try {
    req.user = jwt.verify(auth.split(' ')[1], JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

// ─── Structured audit logger ──────────────────────────────────────────────────
const DATA_DIR = path.join(__dirname, 'data');
const AUDIT_LOG = path.join(DATA_DIR, 'audit.log');

function writeAudit(event) {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.appendFileSync(AUDIT_LOG, JSON.stringify(event) + '\n');
  } catch (e) {
    console.error('[AUDIT] Failed to write audit log:', e.message);
  }
}

// Audit middleware — fires after auth so req.user is set.
// Logs method, route, actor, redacted body (never raw body).
app.use(requireAuth, (req, res, next) => {
  // Defer logging until response finishes so we can capture status
  const start = Date.now();
  res.on('finish', () => {
    writeAudit(buildAuditEvent({
      actor: req.user?.sub || 'unknown',
      action: `${req.method.toLowerCase()}.${req.path.replace(/\//g, '.').replace(/^\./, '')}`,
      resource: req.path,
      status: res.statusCode < 400 ? 'ok' : 'error',
      meta: {
        method: req.method,
        statusCode: res.statusCode,
        durationMs: Date.now() - start,
        // Redact is applied inside buildAuditEvent — body keys like 'body',
        // 'email', 'phone', 'token' are automatically scrubbed.
        query: redact(req.query),
        requestBody: redact(req.body),
      },
    }));
  });
  next();
});

// ─── Data helpers ─────────────────────────────────────────────────────────────
const PROPS_FILE = path.join(DATA_DIR, 'properties.json');
const GMAIL_FILE = path.join(DATA_DIR, 'gmail_connections.json');
const OFFERS_FILE = path.join(DATA_DIR, 'offers.json');
const DRAFTS_FILE = path.join(DATA_DIR, 'drafts.json');

function loadJSON(file, fallback = []) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; }
}
function saveJSON(file, data) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8');
}

// ─── /api/properties ─────────────────────────────────────────────────────────

/** GET /api/properties — list all discovered properties */
app.get('/api/properties', (req, res) => {
  const props = loadJSON(PROPS_FILE);
  const { status, limit = 50 } = req.query;
  const filtered = status ? props.filter(p => p.status === status) : props;
  res.json({ total: filtered.length, properties: filtered.slice(0, Number(limit)) });
});

/** DELETE /api/properties/stale — remove sold/stale entries */
app.delete('/api/properties/stale', (req, res) => {
  const props = loadJSON(PROPS_FILE);
  const { properties: cleaned, removed } = removeStaleProperties(props);
  saveJSON(PROPS_FILE, cleaned);
  writeAudit(buildAuditEvent({ actor: req.user.sub, action: 'properties.remove-stale', resource: 'properties', status: 'ok', meta: { removed, remaining: cleaned.length } }));
  res.json({ removed, remaining: cleaned.length, note: '[SIMULATED] Stale/sold properties removed.' });
});

// ─── /api/discover ───────────────────────────────────────────────────────────

/** GET /api/discover — run a simulated daily discovery sync */
app.get('/api/discover', (req, res) => {
  const count = Math.min(Number(req.query.count) || 5, 20);
  const newProps = simulateDiscovery(count);

  // Load, merge with dedup, verify, then save
  let existing = loadJSON(PROPS_FILE);
  const merged = [...existing, ...newProps];
  const { properties: deduped, removed: dupes } = deduplicateProperties(merged);
  const verified = simulateAvailabilityCheck(deduped);
  const { properties: final, removed: staleRemoved } = removeStaleProperties(verified);
  saveJSON(PROPS_FILE, final);

  writeAudit(buildAuditEvent({
    actor: req.user.sub, action: 'discovery.run', resource: 'properties',
    status: 'ok',
    meta: { newCandidates: count, dupsRemoved: dupes, staleRemoved, total: final.length },
  }));

  res.json({
    added: newProps.length,
    dupsRemoved: dupes,
    staleRemoved,
    total: final.length,
    properties: newProps,
    note: '[SIMULATED] No real property sources queried. Compliant source list used as labels only.',
  });
});

// ─── /api/enrich ─────────────────────────────────────────────────────────────

/** POST /api/enrich — simulate permitted contact enrichment after unlock */
app.post('/api/enrich', (req, res) => {
  const { propertyId, consentGiven } = req.body;
  if (!propertyId) return res.status(400).json({ error: 'propertyId required' });
  if (!consentGiven) {
    return res.status(403).json({ error: 'Buyer consent is required before enrichment.', code: 'CONSENT_REQUIRED' });
  }

  const props = loadJSON(PROPS_FILE);
  const prop = props.find(p => p.id === propertyId);
  if (!prop) return res.status(404).json({ error: 'Property not found' });

  const contact = simulateEnrichment(prop);
  // Mark as enriched in storage
  const updated = props.map(p => p.id === propertyId ? { ...p, enriched: true } : p);
  saveJSON(PROPS_FILE, updated);

  writeAudit(buildAuditEvent({
    actor: req.user.sub, action: 'enrichment.run', resource: propertyId,
    status: contact.available ? 'ok' : 'ok',
    meta: { available: contact.available, provider: contact.provider || null },
  }));

  res.json({ propertyId, contact });
});

// ─── /api/gmail ──────────────────────────────────────────────────────────────

/** POST /api/gmail/connect — simulate Gmail OAuth connection */
app.post('/api/gmail/connect', (req, res) => {
  const { userEmail, consentGiven } = req.body;
  if (!consentGiven) {
    return res.status(403).json({ error: 'User consent required for Gmail integration.', code: 'CONSENT_REQUIRED' });
  }

  const connection = simulateGmailConnect(userEmail);
  // Persist connection state (no real token stored)
  const connections = loadJSON(GMAIL_FILE, {});
  connections[req.user.sub] = { ...connection, connectedAt: new Date().toISOString() };
  saveJSON(GMAIL_FILE, connections);

  writeAudit(buildAuditEvent({
    actor: req.user.sub, action: 'gmail.connect', resource: 'gmail',
    status: 'ok', meta: { scope: connection.scope },
  }));

  res.json(connection);
});

/** POST /api/gmail/draft — AI-draft an outreach email (not sent yet) */
app.post('/api/gmail/draft', (req, res) => {
  const { propertyId, buyerProfile, contactInfo } = req.body;
  if (!propertyId) return res.status(400).json({ error: 'propertyId required' });

  const props = loadJSON(PROPS_FILE);
  const prop = props.find(p => p.id === propertyId);
  if (!prop) return res.status(404).json({ error: 'Property not found' });

  const draft = draftOutreachEmail(prop, buyerProfile, contactInfo);
  const draftId = `draft-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

  // Store draft for approval
  const drafts = loadJSON(DRAFTS_FILE, {});
  drafts[draftId] = { draftId, propertyId, actor: req.user.sub, draft, approved: false, createdAt: new Date().toISOString() };
  saveJSON(DRAFTS_FILE, drafts);

  writeAudit(buildAuditEvent({
    actor: req.user.sub, action: 'gmail.draft', resource: propertyId,
    status: 'pending',
    meta: { draftId, subject: draft.subject },
  }));

  res.json({ draftId, draft, status: 'pending-approval', note: '[SIMULATED] Draft created. Must be approved before sending.' });
});

/** POST /api/gmail/send-approved — buyer approves and "sends" the draft */
app.post('/api/gmail/send-approved', (req, res) => {
  const { draftId, approvalConfirmed, editedBody, editedSubject } = req.body;
  if (!draftId) return res.status(400).json({ error: 'draftId required' });
  if (!approvalConfirmed) {
    return res.status(403).json({ error: 'Buyer approval required before sending.', code: 'APPROVAL_REQUIRED' });
  }

  const drafts = loadJSON(DRAFTS_FILE, {});
  const entry = drafts[draftId];
  if (!entry) return res.status(404).json({ error: 'Draft not found' });
  if (entry.actor !== req.user.sub) return res.status(403).json({ error: 'Not authorized' });

  // Apply any edits the buyer made
  if (editedBody) entry.draft.body = editedBody;
  if (editedSubject) entry.draft.subject = editedSubject;
  entry.approved = true;
  entry.approvedAt = new Date().toISOString();
  entry.status = 'sent-simulated';
  drafts[draftId] = entry;
  saveJSON(DRAFTS_FILE, drafts);

  // In production: use Gmail API to send. Here we log only safe metadata.
  console.log('[SIMULATED EMAIL SEND]', { draftId, to: '[REDACTED]', subject: entry.draft.subject });

  writeAudit(buildAuditEvent({
    actor: req.user.sub, action: 'gmail.send', resource: entry.propertyId,
    status: 'ok',
    meta: { draftId, approvalConfirmed: true, subjectLength: (entry.draft.subject || '').length },
  }));

  res.json({ status: 'sent-simulated', draftId, note: '[SIMULATED] No real email was sent. Gmail API not connected.' });
});

// ─── /api/generate-offer ─────────────────────────────────────────────────────

/** POST /api/generate-offer — AI-generate an offer letter for buyer review */
app.post('/api/generate-offer', (req, res) => {
  const { propertyId, buyerProfile } = req.body;
  if (!propertyId) return res.status(400).json({ error: 'propertyId required' });

  const props = loadJSON(PROPS_FILE);
  const prop = props.find(p => p.id === propertyId);
  if (!prop) return res.status(404).json({ error: 'Property not found' });

  const offer = generateOffer(prop, buyerProfile);
  const offerId = `offer-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

  // Persist for approval workflow
  const offers = loadJSON(OFFERS_FILE, {});
  offers[offerId] = { offerId, propertyId, actor: req.user.sub, offer, approved: false, createdAt: new Date().toISOString() };
  saveJSON(OFFERS_FILE, offers);

  writeAudit(buildAuditEvent({
    actor: req.user.sub, action: 'offer.generate', resource: propertyId,
    status: 'pending',
    meta: { offerId, offerAmount: offer.offerAmount },
  }));

  res.json({ offerId, offer, status: 'pending-approval' });
});

/** POST /api/approve-offer — buyer approves / edits the offer */
app.post('/api/approve-offer', (req, res) => {
  const { offerId, approvalConfirmed, editedText } = req.body;
  if (!offerId) return res.status(400).json({ error: 'offerId required' });
  if (!approvalConfirmed) return res.status(403).json({ error: 'Buyer approval required.', code: 'APPROVAL_REQUIRED' });

  const offers = loadJSON(OFFERS_FILE, {});
  const entry = offers[offerId];
  if (!entry) return res.status(404).json({ error: 'Offer not found' });
  if (entry.actor !== req.user.sub) return res.status(403).json({ error: 'Not authorized' });

  if (editedText) entry.offer.text = editedText;
  entry.approved = true;
  entry.approvedAt = new Date().toISOString();
  offers[offerId] = entry;
  saveJSON(OFFERS_FILE, offers);

  writeAudit(buildAuditEvent({
    actor: req.user.sub, action: 'offer.approve', resource: entry.propertyId,
    status: 'approved',
    meta: { offerId, approvalConfirmed: true },
  }));

  res.json({ status: 'approved', offerId, note: '[SIMULATED] Offer approved for transmittal — not a real legal offer.' });
});

// ─── CRM, Workflows, Pipeline, Followups (simulated) ──────────────────────────

const CRM_FILE = path.join(DATA_DIR, 'crm_connections.json');
const WORKFLOWS_FILE = path.join(DATA_DIR, 'workflows.json');
const PIPELINE_FILE = path.join(DATA_DIR, 'pipeline_states.json');
const FOLLOWUPS_FILE = path.join(DATA_DIR, 'followups.json');

/** POST /api/integrations/crm/connect — connect a CRM */
app.post('/api/integrations/crm/connect', (req, res) => {
  const { provider, apiKey, clientSecret } = req.body;
  if (!provider) return res.status(400).json({ error: 'provider required' });

  const crms = loadJSON(CRM_FILE, {});
  crms[provider] = {
    connected: true,
    connectedAt: new Date().toISOString(),
    apiKey: apiKey || 'mock-key',
    clientSecret: clientSecret || 'mock-secret',
    actor: req.user.sub
  };
  saveJSON(CRM_FILE, crms);

  writeAudit(buildAuditEvent({
    actor: req.user.sub, action: 'crm.connect', resource: provider,
    status: 'ok',
    meta: { provider }
  }));

  res.json({ status: 'connected', provider, note: `[SIMULATED] Successfully connected to ${provider}.` });
});

/** POST /api/integrations/crm/sync — sync lead to connected CRM */
app.post('/api/integrations/crm/sync', (req, res) => {
  const { propertyId, provider } = req.body;
  if (!propertyId || !provider) return res.status(400).json({ error: 'propertyId and provider required' });

  const crms = loadJSON(CRM_FILE, {});
  if (!crms[provider] || !crms[provider].connected) {
    return res.status(400).json({ error: `CRM ${provider} not connected. Connect first.` });
  }

  writeAudit(buildAuditEvent({
    actor: req.user.sub, action: 'crm.sync', resource: propertyId,
    status: 'ok',
    meta: { provider, propertyId }
  }));

  res.json({ status: 'synced', propertyId, provider, note: `[SIMULATED] Lead pushed to ${provider} CRM pipeline successfully.` });
});

/** GET /api/workflows — read custom workflows */
app.get('/api/workflows', (req, res) => {
  const defaultWorkflows = [
    { id: 'auto-enrich', name: 'Auto-enrich owner contact', desc: 'Auto-request skip trace upon unlocking a lead', enabled: false },
    { id: 'auto-draft', name: 'Gmail auto-draft', desc: 'Draft acquisition email via Gmail API upon enrichment', enabled: false },
    { id: 'auto-offer', name: 'AI auto-offer generation', desc: 'Auto-generate Letter of Intent when contact is verified', enabled: false },
    { id: 'auto-crm', name: 'CRM auto-sync', desc: 'Instantly push lead to connected CRM when status moves to contacted', enabled: false }
  ];
  const stored = loadJSON(WORKFLOWS_FILE, null);
  if (!stored) {
    saveJSON(WORKFLOWS_FILE, defaultWorkflows);
    return res.json({ workflows: defaultWorkflows });
  }
  res.json({ workflows: stored });
});

/** POST /api/workflows — save custom workflows configuration */
app.post('/api/workflows', (req, res) => {
  const { workflows } = req.body;
  if (!Array.isArray(workflows)) return res.status(400).json({ error: 'workflows array required' });

  saveJSON(WORKFLOWS_FILE, workflows);

  writeAudit(buildAuditEvent({
    actor: req.user.sub, action: 'workflows.update', resource: 'workflows',
    status: 'ok',
    meta: { count: workflows.length }
  }));

  res.json({ status: 'saved', workflows });
});

/** GET /api/pipeline — get pipeline stages for all leads */
app.get('/api/pipeline', (req, res) => {
  const pipeline = loadJSON(PIPELINE_FILE, {});
  res.json({ pipeline });
});

/** POST /api/pipeline/move — update a lead's pipeline stage */
app.post('/api/pipeline/move', (req, res) => {
  const { propertyId, stage } = req.body;
  const validStages = ['unlocked', 'enriched', 'drafted', 'contacted', 'loi_sent', 'contract'];
  if (!propertyId || !stage) return res.status(400).json({ error: 'propertyId and stage required' });
  if (!validStages.includes(stage)) return res.status(400).json({ error: `Invalid stage: ${stage}. Valid: ${validStages.join(', ')}` });

  const pipeline = loadJSON(PIPELINE_FILE, {});
  pipeline[propertyId] = stage;
  saveJSON(PIPELINE_FILE, pipeline);

  writeAudit(buildAuditEvent({
    actor: req.user.sub, action: 'pipeline.move', resource: propertyId,
    status: 'ok',
    meta: { stage }
  }));

  res.json({ status: 'moved', propertyId, stage });
});

/** GET /api/followups — list all scheduled follow-ups */
app.get('/api/followups', (req, res) => {
  const followups = loadJSON(FOLLOWUPS_FILE, []);
  res.json({ followups });
});

/** POST /api/followups/schedule — schedule a follow-up action */
app.post('/api/followups/schedule', (req, res) => {
  const { propertyId, taskName, dueDays } = req.body;
  if (!propertyId || !taskName) return res.status(400).json({ error: 'propertyId and taskName required' });

  const followups = loadJSON(FOLLOWUPS_FILE, []);
  const dueAt = new Date();
  dueAt.setDate(dueAt.getDate() + (dueDays || 3));

  const entry = {
    id: 'flw-' + Date.now() + '-' + Math.floor(Math.random() * 1000),
    propertyId,
    taskName,
    dueAt: dueAt.toISOString(),
    completed: false,
    actor: req.user.sub
  };

  followups.push(entry);
  saveJSON(FOLLOWUPS_FILE, followups);

  writeAudit(buildAuditEvent({
    actor: req.user.sub, action: 'followups.schedule', resource: propertyId,
    status: 'ok',
    meta: { taskName, dueDays }
  }));

  res.json({ status: 'scheduled', followup: entry });
});

// ─── /api/jobs ────────────────────────────────────────────────────────────────

/** POST /api/jobs/run-daily — manually trigger the daily job */
app.post('/api/jobs/run-daily', (req, res) => {
  const result = runDailyJob();
  res.json({ ...result, triggeredBy: req.user.sub, note: '[SIMULATED] Daily job triggered on demand.' });
});

/** POST /api/jobs/run-weekly — manually trigger the weekly job */
app.post('/api/jobs/run-weekly', (req, res) => {
  const result = runWeeklyJob();
  res.json({ ...result, triggeredBy: req.user.sub, note: '[SIMULATED] Weekly job triggered on demand.' });
});

// ─── Cron jobs ────────────────────────────────────────────────────────────────

function runDailyJob() {
  console.log('[CRON] Running daily discovery job');
  const newProps = simulateDiscovery(5);
  let props = loadJSON(PROPS_FILE);
  const merged = [...props, ...newProps];
  const { properties: deduped, removed: dupes } = deduplicateProperties(merged);
  const verified = simulateAvailabilityCheck(deduped);
  const { properties: final, removed: stale } = removeStaleProperties(verified);
  saveJSON(PROPS_FILE, final);
  const result = { added: newProps.length, dupsRemoved: dupes, staleRemoved: stale, total: final.length, ranAt: new Date().toISOString() };
  writeAudit(buildAuditEvent({ actor: 'system-cron', action: 'jobs.daily', resource: 'properties', status: 'ok', meta: result }));
  console.log('[CRON] Daily job complete', result);
  return result;
}

function runWeeklyJob() {
  console.log('[CRON] Running weekly refresh job');
  let props = loadJSON(PROPS_FILE);
  // Re-run availability check on all
  const refreshed = simulateAvailabilityCheck(props);
  const { properties: final, removed } = removeStaleProperties(refreshed);
  // Mark all remaining as re-enriched (simulated)
  const updated = final.map(p => ({ ...p, lastVerifiedAt: new Date().toISOString() }));
  saveJSON(PROPS_FILE, updated);
  const result = { refreshed: updated.length, removed, ranAt: new Date().toISOString() };
  writeAudit(buildAuditEvent({ actor: 'system-cron', action: 'jobs.weekly', resource: 'properties', status: 'ok', meta: result }));
  console.log('[CRON] Weekly job complete', result);
  return result;
}

// Daily at 02:00 UTC
cron.schedule('0 2 * * *', runDailyJob);
// Weekly Sunday at 03:00 UTC
cron.schedule('0 3 * * 0', runWeeklyJob);

// ─── GET /api/audit — last N audit events (safe, redacted) ───────────────────
app.get('/api/audit', (req, res) => {
  try {
    const lines = fs.existsSync(AUDIT_LOG)
      ? fs.readFileSync(AUDIT_LOG, 'utf8').trim().split('\n').filter(Boolean)
      : [];
    const limit = Math.min(Number(req.query.limit) || 20, 100);
    const events = lines.slice(-limit).map(l => JSON.parse(l)).reverse();
    res.json({ count: events.length, events });
  } catch (e) {
    res.status(500).json({ error: 'Could not read audit log' });
  }
});

// ─── Error handler ────────────────────────────────────────────────────────────
app.use((err, req, res, _next) => {
  console.error('[ERROR]', err.message);
  writeAudit(buildAuditEvent({
    actor: req.user?.sub || 'unknown', action: 'error', resource: req.path,
    status: 'error', meta: { message: err.message, code: err.code },
  }));
  res.status(500).json({ error: 'Internal server error', message: err.message });
});

// ─── Start ────────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`VacancyIQ backend [SIMULATED] listening on port ${PORT}`));
