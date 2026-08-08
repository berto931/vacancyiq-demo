/**
 * server/utils/ai.js
 * Mock / simulated AI logic for the VacancyIQ demo.
 * ALL results are synthetic. No real vendor calls, scraping, or data purchases.
 * Label conventions: any returned string that originated here is [SIMULATED].
 */

// ─── Simulated property sources ──────────────────────────────────────────────
const SIMULATED_SOURCES = [
  'Zillow (compliant API · simulated)',
  'HUD vacancy list (public dataset · simulated)',
  'County tax-delinquent register (public record · simulated)',
  'USPS vacant-address database (USPS AMS API · simulated)',
  'PropertyRadar public data feed (simulated)',
];

const STREET_NAMES = [
  'Elm', 'Maple', 'Oak', 'Cedar', 'Birch', 'Ash', 'Walnut', 'Pinecrest',
  'Holloway', 'Lakeview', 'Summit', 'Valley', 'Ridge', 'Creek', 'Meadow',
];
const CITIES = [
  ['Toledo', 'OH'], ['Akron', 'OH'], ['Dayton', 'OH'],
  ['Canton', 'OH'], ['Cleveland', 'OH'], ['Columbus', 'OH'],
];
const SIGNAL_POOL = ['vacant', 'tax-delinquent', 'absentee-owner', 'pre-foreclosure', 'code-violation', 'utilities-off'];

function rand(n) { return Math.floor(Math.random() * n); }
function choice(arr) { return arr[rand(arr.length)]; }

/**
 * Simulate the daily deep-search discovery job.
 * Returns an array of new candidate property objects.
 * @param {number} [count=5] – how many to generate
 */
export function simulateDiscovery(count = 5) {
  const now = new Date();
  return Array.from({ length: count }, (_, i) => {
    const [city, state] = choice(CITIES);
    const num = rand(9900) + 100;
    const street = `${choice(STREET_NAMES)} ${choice(['St', 'Ave', 'Dr', 'Ct', 'Ln', 'Rd'])}`;
    const signals = Array.from({ length: rand(3) + 1 }, () => choice(SIGNAL_POOL))
      .filter((v, i2, a) => a.indexOf(v) === i2); // dedup
    const price = Math.round(rand(500000) + 80000);
    const score = rand(35) + 55; // 55–90
    return {
      id: `prop-${now.getTime()}-${i}`,
      address: `${num} ${street}, ${city}, ${state}`,
      price,
      beds: rand(4) + 1,
      baths: rand(3) + 1,
      sqft: rand(2000) + 800,
      score,
      signals,
      source: choice(SIMULATED_SOURCES),
      discoveredAt: now.toISOString(),
      lastVerifiedAt: now.toISOString(),
      status: 'available',      // available | stale | sold | removed
      enriched: false,
      note: '[SIMULATED] synthetic property — not real property or owner data',
    };
  });
}

/**
 * Simulate availability verification for a batch of properties.
 * Marks ~15% as newly sold/stale so cleanup logic has something to remove.
 * @param {object[]} properties
 * @returns {object[]} updated properties
 */
export function simulateAvailabilityCheck(properties) {
  const now = new Date().toISOString();
  return properties.map(p => {
    if (p.status === 'removed') return p; // already gone
    const roll = Math.random();
    if (roll < 0.07) return { ...p, status: 'sold', lastVerifiedAt: now };
    if (roll < 0.15) return { ...p, status: 'stale', lastVerifiedAt: now };
    return { ...p, lastVerifiedAt: now };
  });
}

/**
 * Deduplicate a property list by normalized address.
 * Returns { deduped, removed } counts alongside the cleaned array.
 * @param {object[]} properties
 */
export function deduplicateProperties(properties) {
  const seen = new Map();
  const out = [];
  let removed = 0;
  for (const p of properties) {
    const key = p.address.toLowerCase().replace(/\s+/g, ' ').trim();
    if (seen.has(key)) { removed++; continue; }
    seen.set(key, true);
    out.push(p);
  }
  return { properties: out, removed };
}

/**
 * Remove stale / sold / old properties from the list.
 * "Old" = discovered more than 90 days ago with no verification update.
 * @param {object[]} properties
 * @returns { properties, removed }
 */
export function removeStaleProperties(properties) {
  const cutoff = Date.now() - 90 * 24 * 60 * 60 * 1000;
  const out = [];
  let removed = 0;
  for (const p of properties) {
    const stale = p.status === 'sold' || p.status === 'stale'
      || new Date(p.discoveredAt).getTime() < cutoff;
    if (stale) { removed++; continue; }
    out.push(p);
  }
  return { properties: out, removed };
}

// ─── Contact enrichment ───────────────────────────────────────────────────────

/**
 * Simulate contact enrichment after a lead is unlocked by a buyer.
 * Returns phone/email only when the demo randomly decides a permitted source
 * "provided" it.  Always labeled [SIMULATED].
 * In production: would call a licensed skip-trace vendor (e.g. BatchLeads,
 * TLO) under FCRA / GLBA / TCPA-aware contract, after buyer consent.
 * @param {object} property
 */
export function simulateEnrichment(property) {
  const hasContact = Math.random() > 0.35;
  if (!hasContact) {
    return {
      available: false,
      phone: null,
      email: null,
      provider: null,
      note: '[SIMULATED] No contact data found in permitted sources for this record.',
    };
  }
  const seed = property.id.slice(-4);
  return {
    available: true,
    phone: `(${400 + (parseInt(seed, 36) % 500) })-555-${String(Math.floor(Math.random() * 9000) + 1000)}`,
    email: `owner.${seed}@example-demo.com`,
    provider: 'MockSkipTrace API (licensed · simulated)',
    consentNote: 'For real-estate lead-gen only. DNC / TCPA scrub required before outreach. Not for FCRA-covered use.',
    note: '[SIMULATED] synthetic contact — not real owner data',
  };
}

// ─── Gmail / email drafting ───────────────────────────────────────────────────

/**
 * Simulate a Gmail OAuth connection.
 * In production: would initiate Google OAuth 2.0 with gmail.send scope,
 * store the refresh token server-side, and confirm user consent.
 */
export function simulateGmailConnect(userEmail) {
  return {
    connected: true,
    account: userEmail || 'demo.user@gmail.com',
    scope: 'gmail.send (simulated)',
    note: '[SIMULATED] No real OAuth occurred. Nothing sent to Google.',
  };
}

/**
 * Draft a personalised outreach email based on property + buyer profile.
 * Returns subject + body for buyer review and approval before "sending".
 * @param {object} property
 * @param {object} buyerProfile – { name, firm, phone, investmentGoal }
 * @param {object} [contactInfo] – enriched contact data (may be null)
 */
export function draftOutreachEmail(property, buyerProfile, contactInfo) {
  const buyerName = buyerProfile?.name || 'A Local Investor';
  const buyerFirm = buyerProfile?.firm ? ` at ${buyerProfile.firm}` : '';
  const to = contactInfo?.email || '[owner email — enrich first]';
  const subject = `Interest in Your Property at ${property.address}`;
  const body = `Dear Property Owner,

I came across your property at ${property.address} and wanted to reach out directly.

My name is ${buyerName}${buyerFirm}, and I specialize in purchasing vacant and distressed properties in your area. I'm interested in making a fair, as-is cash offer with a quick, hassle-free close.

${property.signals && property.signals.length ? `I noticed your property may have some vacancy or distress signals — I can often make the process very straightforward regardless of condition.` : ''}

If you're open to a conversation, I'd love to discuss a potential offer. There is absolutely no obligation, and I cover all closing costs.

Best regards,
${buyerName}${buyerFirm}
${buyerProfile?.phone || ''}

---
[SIMULATED] This email was AI-drafted for demo purposes. No real email was sent. In production, buyer must review and approve before any outreach. DNC/TCPA compliance required.`;

  return { to, subject, body, draftedAt: new Date().toISOString() };
}

// ─── Offer generation ─────────────────────────────────────────────────────────

/**
 * Generate an AI-style acquisition offer letter.
 * Buyer must review and approve before any real use.
 * @param {object} property
 * @param {object} buyerProfile – { name, firm, phone, investmentGoal, notes }
 */
export function generateOffer(property, buyerProfile) {
  const buyerName = buyerProfile?.name || 'Anonymous Investor';
  const buyerFirm = buyerProfile?.firm ? ` (${buyerProfile.firm})` : '';
  const offerAmt = Math.round(property.price * (0.80 + Math.random() * 0.15)); // 80–95% of list
  const earnest = Math.round(offerAmt * 0.01);
  const closedays = [14, 21, 30][Math.floor(Math.random() * 3)];

  return {
    offerAmount: offerAmt,
    earnestMoney: earnest,
    closingDays: closedays,
    text: `LETTER OF INTENT — NON-BINDING [SIMULATED]

Date: ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}

Property: ${property.address}

Buyer: ${buyerName}${buyerFirm}

Dear Property Owner,

${buyerName}${buyerFirm} is pleased to present the following non-binding Letter of Intent to purchase the above-referenced property under the following terms:

  Purchase Price:   $${offerAmt.toLocaleString()}
  Earnest Money:    $${earnest.toLocaleString()} (held in escrow)
  Closing Period:   ${closedays} days from executed contract
  Inspection:       10-day due-diligence period
  Financing:        All-cash offer — no financing contingency
  As-Is:            Buyer accepts property in current condition

${buyerProfile?.investmentGoal ? `Buyer's intent: ${buyerProfile.investmentGoal}` : ''}
${buyerProfile?.notes ? `Additional notes: ${buyerProfile.notes}` : ''}

This LOI is non-binding and for discussion purposes only. Any binding agreement requires a formal Purchase and Sale Agreement reviewed by qualified legal counsel.

Respectfully submitted,
${buyerName}${buyerFirm}

---
⚠ [SIMULATED] AI-generated draft — not a real offer, not legal advice. Buyer must review, edit, and approve before transmitting to any owner.`,
    note: '[SIMULATED] AI-drafted offer for demo purposes only.',
    requiresApproval: true,
  };
}
