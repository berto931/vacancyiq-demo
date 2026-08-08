/**
 * server/tests/backend.test.js
 * Unit tests for VacancyIQ backend utilities.
 * Run with: node --experimental-vm-modules tests/backend.test.js
 * (or install jest + configure ESM: see package.json)
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { redact, buildAuditEvent } from '../utils/redact.js';
import {
  simulateDiscovery,
  simulateAvailabilityCheck,
  deduplicateProperties,
  removeStaleProperties,
  simulateEnrichment,
  simulateGmailConnect,
  draftOutreachEmail,
  generateOffer,
} from '../utils/ai.js';

// ─── redact ──────────────────────────────────────────────────────────────────
describe('redact()', () => {
  it('redacts top-level sensitive keys', () => {
    const out = redact({ email: 'a@b.com', name: 'Alice', password: 'secret' });
    assert.equal(out.email, '[REDACTED]');
    assert.equal(out.password, '[REDACTED]');
    assert.equal(out.name, 'Alice'); // safe field preserved
  });

  it('redacts nested sensitive keys', () => {
    const out = redact({ contact: { phone: '555', address: '123 Main' } });
    assert.equal(out.contact, '[REDACTED]'); // 'contact' itself is blocked
  });

  it('truncates long strings', () => {
    const long = 'x'.repeat(200);
    const out = redact({ description: long });
    assert.ok(out.description.endsWith('…[truncated]'));
    assert.ok(out.description.length < 200);
  });

  it('handles arrays safely', () => {
    const out = redact([{ email: 'x@y.com' }, { name: 'Bob' }]);
    assert.equal(out[0].email, '[REDACTED]');
    assert.equal(out[1].name, 'Bob');
  });

  it('handles null and primitives', () => {
    assert.equal(redact(null), null);
    assert.equal(redact(42), 42);
    assert.equal(redact('hello'), 'hello');
  });

  it('does not mutate the original object', () => {
    const orig = { email: 'a@b.com', name: 'Alice' };
    redact(orig);
    assert.equal(orig.email, 'a@b.com'); // unchanged
  });
});

// ─── buildAuditEvent ─────────────────────────────────────────────────────────
describe('buildAuditEvent()', () => {
  it('produces required fields', () => {
    const evt = buildAuditEvent({ actor: 'user1', action: 'discovery.run', resource: 'properties' });
    assert.ok(evt.timestamp);
    assert.equal(evt.actor, 'user1');
    assert.equal(evt.action, 'discovery.run');
    assert.equal(evt.resource, 'properties');
    assert.equal(evt.status, 'ok');
  });

  it('redacts sensitive meta', () => {
    const evt = buildAuditEvent({
      actor: 'u', action: 'a', resource: 'r',
      meta: { email: 'x@y.com', count: 5 },
    });
    assert.equal(evt.meta.email, '[REDACTED]');
    assert.equal(evt.meta.count, 5);
  });

  it('truncates long actor/action/resource values', () => {
    const long = 'a'.repeat(200);
    const evt = buildAuditEvent({ actor: long, action: long, resource: long });
    assert.ok(evt.actor.length <= 80);
    assert.ok(evt.action.length <= 80);
    assert.ok(evt.resource.length <= 200);
  });
});

// ─── simulateDiscovery ───────────────────────────────────────────────────────
describe('simulateDiscovery()', () => {
  it('returns requested count', () => {
    const props = simulateDiscovery(3);
    assert.equal(props.length, 3);
  });

  it('each property has required fields', () => {
    const props = simulateDiscovery(2);
    for (const p of props) {
      assert.ok(p.id, 'missing id');
      assert.ok(p.address, 'missing address');
      assert.ok(typeof p.price === 'number', 'price not a number');
      assert.ok(p.status === 'available');
      assert.ok(Array.isArray(p.signals));
      assert.ok(p.note.includes('[SIMULATED]'));
    }
  });

  it('caps count at default 5 when not specified', () => {
    const props = simulateDiscovery();
    assert.equal(props.length, 5);
  });
});

// ─── deduplicateProperties ───────────────────────────────────────────────────
describe('deduplicateProperties()', () => {
  it('removes exact duplicate addresses', () => {
    const props = [
      { id: '1', address: '123 Main St, Toledo, OH' },
      { id: '2', address: '123 Main St, Toledo, OH' }, // duplicate
      { id: '3', address: '456 Elm Ave, Akron, OH' },
    ];
    const { properties, removed } = deduplicateProperties(props);
    assert.equal(removed, 1);
    assert.equal(properties.length, 2);
  });

  it('is case-insensitive', () => {
    const props = [
      { id: '1', address: '123 Main St' },
      { id: '2', address: '123 main st' },
    ];
    const { removed } = deduplicateProperties(props);
    assert.equal(removed, 1);
  });

  it('keeps originals when no duplicates', () => {
    const props = [
      { id: '1', address: 'A' },
      { id: '2', address: 'B' },
    ];
    const { properties, removed } = deduplicateProperties(props);
    assert.equal(removed, 0);
    assert.equal(properties.length, 2);
  });
});

// ─── simulateAvailabilityCheck ───────────────────────────────────────────────
describe('simulateAvailabilityCheck()', () => {
  it('returns same count', () => {
    const props = simulateDiscovery(10);
    const checked = simulateAvailabilityCheck(props);
    assert.equal(checked.length, 10);
  });

  it('updates lastVerifiedAt', () => {
    const before = new Date(Date.now() - 60000).toISOString();
    const props = [{ id: 'x', status: 'available', lastVerifiedAt: before, discoveredAt: before }];
    const checked = simulateAvailabilityCheck(props);
    assert.ok(checked[0].lastVerifiedAt > before);
  });

  it('never changes removed status', () => {
    const props = [{ id: 'x', status: 'removed', lastVerifiedAt: new Date().toISOString() }];
    const checked = simulateAvailabilityCheck(props);
    assert.equal(checked[0].status, 'removed');
  });
});

// ─── removeStaleProperties ───────────────────────────────────────────────────
describe('removeStaleProperties()', () => {
  it('removes sold properties', () => {
    const props = [
      { id: '1', status: 'sold', discoveredAt: new Date().toISOString() },
      { id: '2', status: 'available', discoveredAt: new Date().toISOString() },
    ];
    const { properties, removed } = removeStaleProperties(props);
    assert.equal(removed, 1);
    assert.equal(properties.length, 1);
    assert.equal(properties[0].id, '2');
  });

  it('removes properties older than 90 days', () => {
    const old = new Date(Date.now() - 91 * 24 * 60 * 60 * 1000).toISOString();
    const props = [
      { id: '1', status: 'available', discoveredAt: old },
      { id: '2', status: 'available', discoveredAt: new Date().toISOString() },
    ];
    const { properties, removed } = removeStaleProperties(props);
    assert.equal(removed, 1);
    assert.equal(properties[0].id, '2');
  });
});

// ─── simulateEnrichment ──────────────────────────────────────────────────────
describe('simulateEnrichment()', () => {
  it('returns an object with available flag', () => {
    const prop = { id: 'prop-test-123', address: '1 Test St' };
    const result = simulateEnrichment(prop);
    assert.ok(typeof result.available === 'boolean');
    assert.ok(result.note.includes('[SIMULATED]'));
  });

  it('when available, includes phone and email', () => {
    // Run 20 times to hit the positive branch at least once
    let found = false;
    for (let i = 0; i < 20; i++) {
      const r = simulateEnrichment({ id: `prop-${i}` });
      if (r.available) {
        assert.ok(r.phone, 'phone missing');
        assert.ok(r.email, 'email missing');
        assert.ok(r.email.includes('@'));
        found = true;
        break;
      }
    }
    assert.ok(found, 'Never got an available contact in 20 tries');
  });
});

// ─── simulateGmailConnect ────────────────────────────────────────────────────
describe('simulateGmailConnect()', () => {
  it('returns connected=true with [SIMULATED] note', () => {
    const r = simulateGmailConnect('user@example.com');
    assert.equal(r.connected, true);
    assert.ok(r.note.includes('[SIMULATED]'));
  });

  it('uses provided email', () => {
    const r = simulateGmailConnect('test@test.com');
    assert.equal(r.account, 'test@test.com');
  });
});

// ─── draftOutreachEmail ──────────────────────────────────────────────────────
describe('draftOutreachEmail()', () => {
  const prop = { id: 'p1', address: '100 Oak St, Toledo, OH', signals: ['vacant'] };
  const buyer = { name: 'Jane Doe', firm: 'Doe Investments', phone: '555-0100' };

  it('returns to, subject, body, draftedAt', () => {
    const draft = draftOutreachEmail(prop, buyer, null);
    assert.ok(draft.subject.includes(prop.address));
    assert.ok(draft.body.includes('[SIMULATED]'));
    assert.ok(draft.draftedAt);
  });

  it('includes buyer name in body', () => {
    const draft = draftOutreachEmail(prop, buyer, null);
    assert.ok(draft.body.includes('Jane Doe'));
  });

  it('uses contactInfo email as "to"', () => {
    const draft = draftOutreachEmail(prop, buyer, { email: 'owner@test.com' });
    assert.equal(draft.to, 'owner@test.com');
  });
});

// ─── generateOffer ───────────────────────────────────────────────────────────
describe('generateOffer()', () => {
  const prop = { id: 'p1', address: '200 Elm St, Akron, OH', price: 150000 };
  const buyer = { name: 'John Smith', firm: 'Smith Holdings', investmentGoal: 'Fix and flip' };

  it('returns offer object with required fields', () => {
    const offer = generateOffer(prop, buyer);
    assert.ok(typeof offer.offerAmount === 'number');
    assert.ok(typeof offer.earnestMoney === 'number');
    assert.ok(typeof offer.closingDays === 'number');
    assert.ok(offer.text.includes('[SIMULATED]'));
    assert.equal(offer.requiresApproval, true);
  });

  it('offer amount is 80–95% of list price', () => {
    for (let i = 0; i < 10; i++) {
      const o = generateOffer(prop, buyer);
      assert.ok(o.offerAmount >= prop.price * 0.78, 'offer too low');
      assert.ok(o.offerAmount <= prop.price * 0.97, 'offer too high');
    }
  });

  it('includes buyer name and firm', () => {
    const offer = generateOffer(prop, buyer);
    assert.ok(offer.text.includes('John Smith'));
    assert.ok(offer.text.includes('Smith Holdings'));
  });
});

console.log('✅ All VacancyIQ backend tests complete.');
