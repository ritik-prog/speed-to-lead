const test = require('node:test');
const assert = require('node:assert/strict');
const {
  canonicalizeEmail,
  canonicalizePhone,
  processLead,
  emptyLedger,
} = require('../src/lib/stl');

test('gmail aliases collapse to one identity', () => {
  assert.equal(canonicalizeEmail('Ritik.Makhija+meta@Gmail.com'), 'ritikmakhija@gmail.com');
  assert.equal(canonicalizeEmail('ritikmakhija@googlemail.com'), 'ritikmakhija@gmail.com');
  assert.equal(canonicalizeEmail('not.gmail@agency.com'), 'not.gmail@agency.com');
});

test('indian mobiles become e164', () => {
  assert.deepEqual(canonicalizePhone('09876543210'), { e164: '+919876543210', digits: '919876543210' });
  assert.deepEqual(canonicalizePhone('+91 98765 43210'), { e164: '+919876543210', digits: '919876543210' });
});

test('quarantines leads with no email and no phone', () => {
  const out = processLead({ body: { full_name: 'Ghost' } }, emptyLedger(), { pathHint: 'website' });
  assert.equal(out.decision, 'quarantine');
  assert.equal(out.crm.action, 'skip');
  assert.equal(out.notify.should_notify, false);
});

test('first Meta lead is new and first_source is meta', () => {
  const ledger = emptyLedger();
  const out = processLead(
    {
      body: {
        field_data: [
          { name: 'email', values: ['priya.shah+fb@gmail.com'] },
          { name: 'full_name', values: ['Priya Shah'] },
          { name: 'phone_number', values: ['9876543210'] },
        ],
        form_id: 'form_meta_1',
        ad_id: 'ad_9',
      },
    },
    ledger,
    { pathHint: 'meta', now: Date.parse('2026-08-16T10:00:00Z') },
  );
  assert.equal(out.decision, 'new');
  assert.equal(out.source.capture, 'meta');
  assert.equal(out.source.first_source, 'meta');
  assert.equal(out.identity.email_canonical, 'priyashah@gmail.com');
  assert.equal(out.notify.should_notify, true);
  assert.equal(out.crm.action, 'create');
});

test('same person from Google is a new-source dup, not a new CRM row', () => {
  const ledger = emptyLedger();
  const t1 = Date.parse('2026-08-16T10:00:00Z');
  processLead(
    { body: { email: 'priya.shah@gmail.com', full_name: 'Priya Shah' } },
    ledger,
    { pathHint: 'meta', now: t1 },
  );
  const out = processLead(
    {
      body: {
        user_column_data: [
          { column_id: 'EMAIL', string_value: 'priyashah@gmail.com' },
          { column_id: 'FULL_NAME', string_value: 'Priya Shah' },
        ],
        gcl_id: 'CjwKCAjw',
      },
    },
    ledger,
    { pathHint: 'google', now: t1 + 60 * 60 * 1000 },
  );
  assert.equal(out.decision, 'duplicate_new_source');
  assert.equal(out.source.first_source, 'meta');
  assert.deepEqual(out.source.all_sources, ['meta', 'google']);
  assert.equal(out.crm.action, 'update');
  assert.equal(out.notify.should_notify, true);
  assert.match(out.notify.slack_payload.text, /Existing contact, new channel GOOGLE/);
});

test('a new channel inside the hot window still tags the source and notifies', () => {
  const ledger = emptyLedger();
  const t1 = Date.parse('2026-08-16T10:00:00Z');
  processLead({ body: { email: 'priya.shah@gmail.com' } }, ledger, { pathHint: 'meta', now: t1 });
  const out = processLead(
    { body: { email: 'priyashah@gmail.com' } },
    ledger,
    { pathHint: 'google', now: t1 + 2 * 60 * 1000 },
  );
  assert.equal(out.decision, 'duplicate_new_source');
  assert.equal(out.source.first_source, 'meta');
  assert.deepEqual(out.source.all_sources, ['meta', 'google']);
  assert.equal(out.notify.should_notify, true);
});

test('hot window suppresses a second ping so sales is not spammed', () => {
  const ledger = emptyLedger();
  const t1 = Date.parse('2026-08-16T10:00:00Z');
  processLead({ body: { email: 'a@agency.com' } }, ledger, { pathHint: 'website', now: t1 });
  const out = processLead(
    { body: { email: 'a@agency.com' } },
    ledger,
    { pathHint: 'website', now: t1 + 3 * 60 * 1000 },
  );
  assert.equal(out.decision, 'duplicate_hot_window');
  assert.equal(out.notify.should_notify, false);
  assert.equal(out.ledger.hit_count, 2);
});

test('website form with gclid is still website capture, google paid attribution', () => {
  const out = processLead(
    { body: { email: 'buyer@firm.com', gclid: 'abc', utm_source: 'google', page_url: 'https://client.com/contact' } },
    emptyLedger(),
    { pathHint: 'website' },
  );
  assert.equal(out.decision, 'new');
  assert.equal(out.source.capture, 'website');
  assert.equal(out.source.paid_attribution, 'google');
});

test('repeat submit on the same channel after the hot window is a quiet update', () => {
  const ledger = emptyLedger();
  const t1 = Date.parse('2026-08-16T10:00:00Z');
  processLead({ body: { email: 'repeat@firm.com' } }, ledger, { pathHint: 'website', now: t1 });
  const out = processLead(
    { body: { email: 'repeat@firm.com' } },
    ledger,
    { pathHint: 'website', now: t1 + 20 * 60 * 1000 },
  );
  assert.equal(out.decision, 'duplicate_same_source');
  assert.equal(out.notify.should_notify, false);
  assert.equal(out.crm.action, 'update');
});

test('same phone + different email is review, not a silent merge', () => {
  const ledger = emptyLedger();
  processLead(
    { body: { email: 'owner@clinic.com', phone: '9876543210', full_name: 'Owner' } },
    ledger,
    { pathHint: 'website' },
  );
  const out = processLead(
    { body: { email: 'ads@clinic.com', phone: '9876543210', full_name: 'Ads Manager' } },
    ledger,
    { pathHint: 'meta' },
  );
  assert.equal(out.decision, 'review_phone_collision');
  assert.equal(out.crm.action, 'create');
  assert.equal(out.collision.other_email, 'owner@clinic.com');
  assert.equal(Object.keys(ledger.leads).length, 2);
});
