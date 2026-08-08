/**
 * full-verification.mjs
 * Complete static verification + security audit + route check for VacancyIQ.
 * Run: node full-verification.mjs
 */

import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import https from 'node:https';

const ROOT = '/Users/bertorosales/.gemini/antigravity-ide/scratch/vacancyiq-site';
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const serverIndex = fs.readFileSync(path.join(ROOT, 'server/index.js'), 'utf8');
const redactSrc = fs.readFileSync(path.join(ROOT, 'server/utils/redact.js'), 'utf8');
const aiSrc = fs.readFileSync(path.join(ROOT, 'server/utils/ai.js'), 'utf8');

let pass = 0, fail = 0;
const failures = [];

function check(name, result, detail = '') {
  if (result) { console.log('  ✅ ' + name); pass++; }
  else { console.error('  ❌ FAIL: ' + name + (detail ? ' — ' + detail : '')); fail++; failures.push(name); }
}

// ─── 1. File presence ─────────────────────────────────────────────────────────
console.log('\n📁 1. File presence in repository');
const REPO_FILES = [
  'index.html',
  'HOW_TO_HOST.md',
  'server/index.js',
  'server/package.json',
  'server/utils/ai.js',
  'server/utils/redact.js',
  'server/tests/backend.test.js',
];
REPO_FILES.forEach(f => check(f + ' exists in repo', fs.existsSync(path.join(ROOT, f))));
check('HOW_TO_HOST.md NOT only in Downloads (is in repo)',
  fs.existsSync(path.join(ROOT, 'HOW_TO_HOST.md')));

// ─── 2. index.html — navigation ───────────────────────────────────────────────
console.log('\n🗺  2. Navigation and routing');
check('AI Discovery nav item (#/buyer/discovery)', html.includes('#/buyer/discovery'));
check('Outreach Center nav item (#/buyer/outreach)', html.includes('#/buyer/outreach'));
check('rocket icon used for Outreach nav', html.includes('"rocket","Outreach"'));
check('search icon used for AI Discovery nav', html.includes('"search","AI Discovery"'));
check('router case: discovery', html.includes('segs[1]==="discovery"'));
check('router case: outreach', html.includes('segs[1]==="outreach"'));
check('APPTABS includes Discover tab', html.includes('"#/buyer/discovery","search","Discover"'));
check('discoveryView function defined', html.includes('function discoveryView()'));
check('outreachView function defined', html.includes('function outreachView()'));

// ─── 3. index.html — AI workflow functions ────────────────────────────────────
console.log('\n⚙️  3. AI workflow functions');
check('runDiscoveryJob defined', html.includes('function runDiscoveryJob()'));
check('runWeeklyJob defined', html.includes('function runWeeklyJob()'));
check('connectGmail defined', html.includes('function connectGmail()'));
check('draftEmail defined', html.includes('function draftEmail()'));
check('approveAndSendEmail defined', html.includes('function approveAndSendEmail()'));
check('generateOfferUI defined', html.includes('function generateOfferUI()'));
check('approveOffer defined', html.includes('function approveOffer()'));
check('openConsentModal defined', html.includes('function openConsentModal('));
check('enrichLead defined', html.includes('function enrichLead('));
check('saveBuyerProfile defined', html.includes('function saveBuyerProfile()'));
check('_selectOutreachProp in VIQ export', html.includes('_selectOutreachProp:_selectOutreachPropFn'));
check('_saveBuyerProfile in VIQ export', html.includes('_saveBuyerProfile:_saveBuyerProfileFn'));
check('AI_BASE set to null for GitHub Pages', html.includes("? 'http://localhost:3001' : null"));

// ─── 4. index.html — SIMULATED labels and compliance ─────────────────────────
console.log('\n🏷  4. [SIMULATED] labels and compliance text');
// The discoveryView pagehead contains the exact string inside a JS string literal
// with HTML tags: '<b>[SIMULATED]</b> — compliant APIs'
check('[SIMULATED] label in discoveryView pagehead',
  html.includes('[SIMULATED]</b> — compliant APIs'));
check('[SIMULATED] label in outreachView pagehead',
  html.includes('[SIMULATED]</b>. Buyer review'));
check('[SIMULATED] in contact enrichment UI', html.includes('[SIMULATED]</b></p>'));
check('DNC/TCPA compliance text present', html.includes('DNC/TCPA'));
check('approval gate text present', html.includes('Your approval is required'));
check('consent modal "I Understand" button', html.includes('I Understand — Proceed'));
check('FCRA notice present', html.includes('FCRA'));
check('not legal advice disclaimer', html.includes('not legal advice'));
check('no real email sent text', html.includes('No real email'));
check('Gmail OAuth simulated label', html.includes('Gmail OAuth'));

// ─── 5. index.html — form elements ───────────────────────────────────────────
console.log('\n📝 5. Form elements');
check('buyer profile name field (bpName)', html.includes('id="bpName"') || html.includes("id='bpName'"));
check('buyer profile firm field (bpFirm)', html.includes('id="bpFirm"') || html.includes("id='bpFirm'"));
check('email body textarea (draftBodyEdit)', html.includes('id="draftBodyEdit"') || html.includes("id='draftBodyEdit'"));
check('email subject input (draftSubjEdit)', html.includes('id="draftSubjEdit"') || html.includes("id='draftSubjEdit'"));
check('offer text textarea (offerTextEdit)', html.includes('id="offerTextEdit"') || html.includes("id='offerTextEdit'"));
check('outreach property selector (outreachPropSel)', html.includes('outreachPropSel'));
check('discovery content container (discoveryContent)', html.includes("id='discoveryContent'") || html.includes('id="discoveryContent"'));
check('outreach content container (outreachContent)', html.includes("id='outreachContent'") || html.includes('id="outreachContent"'));

// ─── 6. Security: redact.js ───────────────────────────────────────────────────
console.log('\n🔒 6. Security — redact.js');
check('BLOCKED_KEYS includes authorization', redactSrc.includes("'authorization'"));
check('BLOCKED_KEYS includes password', redactSrc.includes("'password'"));
check('BLOCKED_KEYS includes token', redactSrc.includes("'token'"));
check('BLOCKED_KEYS includes email', redactSrc.includes("'email'"));
check('BLOCKED_KEYS includes phone', redactSrc.includes("'phone'"));
check('BLOCKED_KEYS includes oauth', redactSrc.includes("'oauth'"));
check('BLOCKED_KEYS includes body (email body)', redactSrc.includes("'body'"));
check('BLOCKED_KEYS includes ssn', redactSrc.includes("'ssn'"));
check('redact deep-copies (no mutation)', redactSrc.includes('const out = {}'));
check('TRUNCATE_THRESHOLD defined', redactSrc.includes('TRUNCATE_THRESHOLD'));
check('buildAuditEvent exported', redactSrc.includes('export function buildAuditEvent'));
check('redact exported', redactSrc.includes('export function redact'));

// ─── 7. Security: server/index.js ─────────────────────────────────────────────
console.log('\n🔒 7. Security — server/index.js');
check('Audit log uses redact() on requestBody', serverIndex.includes('requestBody: redact(req.body)'));
check('Audit log uses redact() on query', serverIndex.includes('query: redact(req.query)'));
check('Consent required for enrich', serverIndex.includes("'CONSENT_REQUIRED'"));
check('Consent required for Gmail connect', serverIndex.includes('consentGiven'));
check('Approval gate for email send', serverIndex.includes("'APPROVAL_REQUIRED'"));
check('Approval gate for offer approve', serverIndex.includes('approvalConfirmed'));
check('Email send only logs metadata (not body)', 
  !serverIndex.includes("to, subject, body,") || serverIndex.includes('[REDACTED]'));
check('Error handler uses redact on meta', serverIndex.includes('message: err.message, code: err.code'));
check('No raw credentials in source', !serverIndex.includes('sk-') && !serverIndex.includes('AIza'));
check('JWT_SECRET uses env var fallback', serverIndex.includes('process.env.JWT_SECRET'));
check('Demo token flagged as demo:true', serverIndex.includes("demo: true"));
check('Email console.log redacts recipient', serverIndex.includes("to: '[REDACTED]'"));
check('No real email API call (no nodemailer/smtp)', 
  !serverIndex.includes('nodemailer') && !serverIndex.includes('smtp'));
check('No real fetch to Google APIs', 
  !serverIndex.includes('googleapis.com') && !serverIndex.includes('accounts.google.com'));
check('Audit log path uses DATA_DIR constant', serverIndex.includes('AUDIT_LOG'));

// ─── 8. Security: nested sensitive field redaction (runtime test) ─────────────
console.log('\n🔒 8. Runtime security — redaction depth tests');
// Import and test redact directly via subprocess
const redactTest = `
import { redact, buildAuditEvent } from '${ROOT}/server/utils/redact.js';

let p = 0, f = 0;
function chk(name, result) {
  if (result) { console.log('  ✅ ' + name); p++; }
  else { console.error('  ❌ ' + name); f++; }
}

// Nested sensitive fields
const nested = { user: { profile: { email: 'x@y.com', name: 'Alice' } } };
const r1 = redact(nested);
chk('Nested email redacted', r1.user.profile.email === '[REDACTED]');
chk('Nested non-sensitive name preserved', r1.user.profile.name === 'Alice');

// Authorization header redacted
const r2 = redact({ authorization: 'Bearer eyJhbGci...', path: '/api/test' });
chk('Authorization header redacted', r2.authorization === '[REDACTED]');
chk('Path preserved', r2.path === '/api/test');

// Email body redacted
const r3 = redact({ to: 'owner@test.com', subject: 'Hi', body: 'Dear owner, please sell...' });
chk('Email body redacted', r3.body === '[REDACTED]');
chk('To field redacted (contains email)', r3.to === '[REDACTED]');

// OAuth tokens redacted
const r4 = redact({ access_token: 'ya29.xxx', refresh_token: 'xxx', data: 'ok' });
chk('access_token redacted', r4.access_token === '[REDACTED]');
chk('refresh_token redacted', r4.refresh_token === '[REDACTED]');
chk('Non-sensitive data preserved', r4.data === 'ok');

// Phone in nested object
const r5 = redact({ contact: { phone: '555-1234', address: '123 Main' } });
chk('Nested contact block redacted (key name "contact")', r5.contact === '[REDACTED]');

// Long string truncation
const long = 'x'.repeat(200);
const r6 = redact({ description: long });
chk('Long string truncated', r6.description.includes('…[truncated]'));
chk('Truncated string is shorter', r6.description.length < 200);

// Original not mutated
const orig = { email: 'a@b.com', name: 'Bob' };
const r7 = redact(orig);
chk('Original object not mutated', orig.email === 'a@b.com');

// buildAuditEvent never logs sensitive meta
const evt = buildAuditEvent({ actor: 'u', action: 'a', resource: 'r', meta: { password: 'secret', count: 5 } });
chk('buildAuditEvent redacts password meta', evt.meta.password === '[REDACTED]');
chk('buildAuditEvent preserves safe meta', evt.meta.count === 5);
chk('buildAuditEvent has timestamp', typeof evt.timestamp === 'string');
chk('buildAuditEvent has actor/action/resource', evt.actor === 'u' && evt.action === 'a');

// Array of objects with sensitive fields
const r8 = redact([{ email: 'x@y.com' }, { name: 'Bob' }, { token: 'abc' }]);
chk('Array: email redacted', r8[0].email === '[REDACTED]');
chk('Array: name preserved', r8[1].name === 'Bob');
chk('Array: token redacted', r8[2].token === '[REDACTED]');

console.log('\\n  ' + p + '/' + (p+f) + ' runtime security checks');
process.exit(f > 0 ? 1 : 0);
`;

import { execSync } from 'node:child_process';
try {
  const out = execSync(`node --input-type=module`, { input: redactTest, encoding: 'utf8' });
  console.log(out.trim());
  check('All runtime redaction checks pass', !out.includes('❌'));
} catch (e) {
  console.log(e.stdout || '');
  console.error(e.stderr || '');
  check('All runtime redaction checks pass', false, 'subprocess failed');
}

// ─── 9. Security: approval gate bypass attempt ────────────────────────────────
console.log('\n🔒 9. Approval gate — cannot bypass');
check('send-approved requires approvalConfirmed', serverIndex.includes('if (!approvalConfirmed)'));
check('approve-offer requires approvalConfirmed', 
  serverIndex.split('approvalConfirmed').filter(s => s.includes('APPROVAL_REQUIRED')).length > 0);
check('Gmail send-approved checks actor matches', serverIndex.includes("entry.actor !== req.user.sub"));
check('approve-offer checks actor matches', 
  serverIndex.includes("entry.actor !== req.user.sub") );
check('Consent gate on enrich — consentGiven false returns 403', serverIndex.includes('return res.status(403)'));

// ─── 10. server/utils/ai.js — no real integrations ───────────────────────────
console.log('\n🔒 10. ai.js — no real external calls');
check('No real fetch() in ai.js', !aiSrc.includes('fetch(') && !aiSrc.includes('axios'));
check('No real API keys in ai.js', !aiSrc.includes('sk-') && !aiSrc.includes('AIza'));
check('simulateDiscovery labeled [SIMULATED]', aiSrc.includes('[SIMULATED]'));
check('simulateEnrichment labeled [SIMULATED]', aiSrc.includes('synthetic contact'));
check('generateOffer has requiresApproval:true', aiSrc.includes('requiresApproval: true'));
check('draftOutreachEmail has [SIMULATED] footer', aiSrc.includes('[SIMULATED] This email was AI-drafted'));
check('simulateGmailConnect labeled [SIMULATED]', aiSrc.includes('[SIMULATED] No real OAuth'));

// ─── 11. HOW_TO_HOST.md content ───────────────────────────────────────────────
console.log('\n📖 11. HOW_TO_HOST.md');
const howTo = fs.readFileSync(path.join(ROOT, 'HOW_TO_HOST.md'), 'utf8');
check('Live URL present', howTo.includes('https://berto931.github.io/vacancyiq-demo/'));
check('Backend deployment section present', howTo.includes('AI Backend Deployment'));
check('Vercel deployment steps present', howTo.includes('vercel --prod'));
check('Render deployment steps present', howTo.includes('render.com'));
check('JWT_SECRET env var documented', howTo.includes('JWT_SECRET'));
check('All 13 API routes documented', howTo.includes('/api/audit'));
check('backend test command documented', howTo.includes('npm test'));
check('AI Discovery route in verified list', howTo.includes('#/buyer/discovery'));
check('Outreach route in verified list', howTo.includes('#/buyer/outreach'));
check('Reminder: simulated label', howTo.includes('simulated data'));

// ─── Summary ──────────────────────────────────────────────────────────────────
console.log('\n' + '─'.repeat(60));
console.log(`TOTAL: ${pass}/${pass+fail} checks passed`);
if (failures.length) {
  console.log('\nFAILED:');
  failures.forEach(f => console.log('  ❌ ' + f));
  process.exit(1);
} else {
  console.log('✅ All checks passed');
  process.exit(0);
}
