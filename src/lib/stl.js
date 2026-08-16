/**
 * Speed-to-lead identity + source tagging + email dedup.
 * Pure functions — same code runs in node:test and inside the n8n Code node.
 *
 * Capture source (Meta vs Google vs website) is who handed us the lead.
 * Paid attribution (gclid / fbclid / utm) is how they arrived. Do not mix them.
 */

const GMAIL_DOMAINS = new Set(['gmail.com', 'googlemail.com']);

const SOURCE_ALIASES = {
  meta: 'meta',
  facebook: 'meta',
  fb: 'meta',
  instagram: 'meta',
  ig: 'meta',
  'facebook ads': 'meta',
  'meta ads': 'meta',
  'lead ads': 'meta',
  google: 'google',
  'google ads': 'google',
  adwords: 'google',
  'google lead form': 'google',
  'google lead ads': 'google',
  website: 'website',
  web: 'website',
  organic: 'website',
  form: 'website',
  wordpress: 'website',
  typeform: 'website',
  webflow: 'website',
  hubspot: 'website',
};

const EMAIL_KEYS = [
  'email',
  'email_address',
  'emailaddress',
  'work_email',
  'user_email',
];

const PHONE_KEYS = [
  'phone',
  'phone_number',
  'phonenumber',
  'mobile',
  'mobile_phone',
  'tel',
];

const NAME_KEYS = ['full_name', 'fullname', 'name', 'your_name'];

function nowIso(now) {
  return new Date(now).toISOString();
}

function asString(value) {
  if (value == null) return '';
  if (Array.isArray(value)) return asString(value[0]);
  if (typeof value === 'object') {
    if (value.string_value != null) return asString(value.string_value);
    if (value.values != null) return asString(value.values);
    if (value.value != null) return asString(value.value);
    return '';
  }
  return String(value).trim();
}

function pick(obj, keys) {
  if (!obj || typeof obj !== 'object') return '';
  for (const key of keys) {
    if (obj[key] != null && asString(obj[key])) return asString(obj[key]);
    const lower = key.toLowerCase();
    for (const [k, v] of Object.entries(obj)) {
      if (k.toLowerCase().replace(/[\s-]/g, '_') === lower && asString(v)) {
        return asString(v);
      }
    }
  }
  return '';
}

function flattenFieldData(fieldData) {
  const out = {};
  if (!Array.isArray(fieldData)) return out;
  for (const field of fieldData) {
    const name = asString(field.name || field.column_id || field.id).toLowerCase();
    if (!name) continue;
    out[name] = asString(field.values || field.string_value || field.value);
  }
  return out;
}

function unwrapPayload(input) {
  if (!input || typeof input !== 'object') return {};
  const body = input.body && typeof input.body === 'object' ? input.body : input;

  if (Array.isArray(body.field_data)) {
    return {
      ...flattenFieldData(body.field_data),
      ...body,
      _shape: 'meta_lead',
    };
  }

  if (Array.isArray(body.user_column_data)) {
    return {
      ...flattenFieldData(body.user_column_data),
      ...body,
      _shape: 'google_lead',
    };
  }

  const change =
    body.entry?.[0]?.changes?.[0]?.value ||
    body.entry?.[0]?.changes?.[0] ||
    null;
  if (change && (change.leadgen_id || change.form_id)) {
    return { ...body, ...change, _shape: 'meta_ping' };
  }

  return { ...body, _shape: 'generic' };
}

function canonicalizeEmail(raw) {
  let email = asString(raw).normalize('NFKC').toLowerCase();
  email = email.replace(/\s+/g, '');
  if (!email) return '';
  const at = email.lastIndexOf('@');
  if (at < 1 || at === email.length - 1) return '';
  let local = email.slice(0, at);
  let domain = email.slice(at + 1).replace(/\.$/, '');
  if (!domain.includes('.') || local.startsWith('.') || local.endsWith('.')) {
    return '';
  }
  if (GMAIL_DOMAINS.has(domain)) {
    local = local.split('+')[0].replace(/\./g, '');
    domain = 'gmail.com';
  }
  if (!local || !/^[a-z0-9._%+-]+$/i.test(local)) return '';
  return `${local}@${domain}`;
}

function canonicalizePhone(raw, defaultRegion = 'IN') {
  const original = asString(raw);
  if (!original) return { e164: '', digits: '' };
  let digits = original.replace(/\D/g, '');
  if (!digits) return { e164: '', digits: '' };

  if (defaultRegion === 'IN') {
    if (digits.length === 11 && digits.startsWith('0')) digits = digits.slice(1);
    if (digits.length === 12 && digits.startsWith('91')) {
      /* already has country code */
    } else if (digits.length === 10 && /^[6-9]/.test(digits)) {
      digits = `91${digits}`;
    }
  }

  if (digits.length < 8 || digits.length > 15) {
    return { e164: '', digits: '' };
  }
  return { e164: `+${digits}`, digits };
}

function splitName(full, first, last) {
  const firstName = asString(first);
  const lastName = asString(last);
  if (firstName || lastName) {
    return {
      first_name: firstName,
      last_name: lastName,
      full_name: [firstName, lastName].filter(Boolean).join(' '),
    };
  }
  const whole = asString(full);
  if (!whole) return { first_name: '', last_name: '', full_name: '' };
  const parts = whole.split(/\s+/);
  return {
    first_name: parts[0] || '',
    last_name: parts.slice(1).join(' '),
    full_name: whole,
  };
}

function inferCaptureSource(payload, pathHint) {
  const explicit = asString(
    payload.capture_source || payload.source || payload.lead_source || pathHint,
  )
    .toLowerCase()
    .trim();
  if (explicit && SOURCE_ALIASES[explicit]) return SOURCE_ALIASES[explicit];

  if (payload._shape === 'meta_lead' || payload._shape === 'meta_ping') return 'meta';
  if (payload._shape === 'google_lead') return 'google';
  if (payload.form_id && payload.page_id) return 'meta';
  if (payload.leadgen_id || payload.ad_id) return 'meta';
  if (payload.gcl_id || payload.google_key) return 'google';
  if (pathHint && SOURCE_ALIASES[pathHint]) return SOURCE_ALIASES[pathHint];
  return 'website';
}

function inferPaidAttribution(payload) {
  const gclid = asString(payload.gclid || payload.gcl_id);
  const fbclid = asString(payload.fbclid);
  const utmSource = asString(payload.utm_source).toLowerCase();
  const utmMedium = asString(payload.utm_medium).toLowerCase();
  const utmCampaign = asString(payload.utm_campaign || payload.campaign_name);

  let paid = 'none';
  if (
    gclid ||
    utmSource === 'google' ||
    utmSource === 'adwords' ||
    (utmMedium === 'cpc' && utmSource.includes('google'))
  ) {
    paid = 'google';
  }
  if (fbclid || utmSource === 'facebook' || utmSource === 'fb' || utmSource === 'instagram' || utmSource === 'meta' || utmSource === 'ig') {
    paid = paid === 'google' ? 'mixed' : 'meta';
  }

  return {
    paid,
    gclid,
    fbclid,
    utm_source: utmSource,
    utm_medium: utmMedium,
    utm_campaign: utmCampaign,
    form_id: asString(payload.form_id || payload.formId),
    campaign_id: asString(payload.campaign_id || payload.campaignId),
    ad_id: asString(payload.ad_id || payload.adId),
    page_id: asString(payload.page_id || payload.pageId),
    page_url: asString(payload.page_url || payload.landing_page || payload.referrer),
  };
}

function pathHintFromWebhookUrl(webhookUrl) {
  const match = asString(webhookUrl).match(/stl\/(meta|google|website|admin)\b/i);
  return match ? match[1].toLowerCase() : '';
}

function emptyLedger() {
  return { leads: {}, phones: {} };
}

function findByEmail(ledger, emailCanonical) {
  if (!emailCanonical) return null;
  return ledger.leads[emailCanonical] || null;
}

function findByPhone(ledger, phoneDigits, exceptEmail) {
  if (!phoneDigits) return null;
  const emailKey = ledger.phones[phoneDigits];
  if (!emailKey) return null;
  if (exceptEmail && emailKey === exceptEmail) return ledger.leads[emailKey] || null;
  return ledger.leads[emailKey] || null;
}

function buildRecord({ identity, person, captureSource, attribution, now, existing }) {
  const receivedAt = nowIso(now);
  if (!existing) {
    return {
      identity_key: identity.email_canonical || identity.phone.digits,
      email_canonical: identity.email_canonical,
      email_original: identity.email_original,
      phone_e164: identity.phone.e164,
      phone_digits: identity.phone.digits,
      first_name: person.first_name,
      last_name: person.last_name,
      full_name: person.full_name,
      first_source: captureSource,
      last_source: captureSource,
      all_sources: [captureSource],
      first_seen_at: receivedAt,
      last_seen_at: receivedAt,
      hit_count: 1,
      last_attribution: attribution,
    };
  }

  const allSources = existing.all_sources.includes(captureSource)
    ? existing.all_sources
    : [...existing.all_sources, captureSource];

  return {
    ...existing,
    email_original: identity.email_original || existing.email_original,
    phone_e164: identity.phone.e164 || existing.phone_e164,
    phone_digits: identity.phone.digits || existing.phone_digits,
    first_name: person.first_name || existing.first_name,
    last_name: person.last_name || existing.last_name,
    full_name: person.full_name || existing.full_name,
    last_source: captureSource,
    all_sources: allSources,
    last_seen_at: receivedAt,
    hit_count: (existing.hit_count || 1) + 1,
    last_attribution: attribution,
  };
}

function minutesBetween(fromIso, now) {
  if (!fromIso) return null;
  return Math.round((now - Date.parse(fromIso)) / 60000);
}

function processLead(input, ledger, options = {}) {
  const now = options.now ?? Date.now();
  const config = {
    hotWindowMinutes: 15,
    slackWebhookUrl: '',
    hubspotToken: '',
    notifyOnNewSource: true,
    notifyOnSameSourceDup: false,
    defaultPhoneRegion: 'IN',
    ...options.config,
  };

  const webhookUrl = input && input.webhookUrl ? input.webhookUrl : '';
  const pathHint = options.pathHint || pathHintFromWebhookUrl(webhookUrl);
  const payload = unwrapPayload(input);
  const captureSource = inferCaptureSource(payload, pathHint);
  const attribution = inferPaidAttribution(payload);

  const emailOriginal = pick(payload, EMAIL_KEYS);
  const emailCanonical = canonicalizeEmail(emailOriginal);
  const phone = canonicalizePhone(pick(payload, PHONE_KEYS), config.defaultPhoneRegion);
  const person = splitName(
    pick(payload, NAME_KEYS),
    pick(payload, ['first_name', 'firstname', 'first']),
    pick(payload, ['last_name', 'lastname', 'last']),
  );

  const identity = {
    email_original: emailOriginal,
    email_canonical: emailCanonical,
    phone,
  };

  if (!emailCanonical && !phone.digits) {
    return buildOutput({
      decision: 'quarantine',
      reason: 'no_identity',
      identity,
      person,
      captureSource,
      attribution,
      ledgerRecord: null,
      existing: null,
      config,
      now,
      crmAction: 'skip',
      shouldNotify: false,
      notifyReason: 'quarantine',
    });
  }

  const emailHit = findByEmail(ledger, emailCanonical);
  const phoneHit = findByPhone(ledger, phone.digits, emailCanonical);

  if (emailCanonical && phoneHit && phoneHit.email_canonical && phoneHit.email_canonical !== emailCanonical) {
    const record = buildRecord({
      identity,
      person,
      captureSource,
      attribution,
      now,
      existing: null,
    });
    writeLedger(ledger, record);
    return buildOutput({
      decision: 'review_phone_collision',
      reason: 'same_phone_different_email',
      identity,
      person,
      captureSource,
      attribution,
      ledgerRecord: record,
      existing: phoneHit,
      config,
      now,
      crmAction: 'create',
      shouldNotify: true,
      notifyReason: 'possible_duplicate_phone',
      collision: {
        other_email: phoneHit.email_canonical,
        other_first_source: phoneHit.first_source,
      },
    });
  }

  const existing = emailHit || (!emailCanonical ? phoneHit : null);

  if (!existing) {
    const record = buildRecord({ identity, person, captureSource, attribution, now, existing: null });
    writeLedger(ledger, record);
    return buildOutput({
      decision: 'new',
      reason: 'first_seen',
      identity,
      person,
      captureSource,
      attribution,
      ledgerRecord: record,
      existing: null,
      config,
      now,
      crmAction: 'create',
      shouldNotify: true,
      notifyReason: 'new_lead',
    });
  }

  const newSource = !existing.all_sources.includes(captureSource);
  const minutesSince = minutesBetween(existing.last_seen_at, now);
  const inHotWindow = minutesSince != null && minutesSince < config.hotWindowMinutes;
  const record = buildRecord({ identity, person, captureSource, attribution, now, existing });
  writeLedger(ledger, record);

  if (newSource) {
    return buildOutput({
      decision: 'duplicate_new_source',
      reason: 'existing_contact_new_channel',
      identity,
      person,
      captureSource,
      attribution,
      ledgerRecord: record,
      existing,
      config,
      now,
      crmAction: 'update',
      shouldNotify: config.notifyOnNewSource,
      notifyReason: 'multi_channel',
    });
  }

  if (inHotWindow) {
    return buildOutput({
      decision: 'duplicate_hot_window',
      reason: 'same_person_within_hot_window',
      identity,
      person,
      captureSource,
      attribution,
      ledgerRecord: record,
      existing,
      config,
      now,
      crmAction: 'update',
      shouldNotify: false,
      notifyReason: 'suppressed_hot_window',
    });
  }

  return buildOutput({
    decision: 'duplicate_same_source',
    reason: 'repeat_submit_same_channel',
    identity,
    person,
    captureSource,
    attribution,
    ledgerRecord: record,
    existing,
    config,
    now,
    crmAction: 'update',
    shouldNotify: config.notifyOnSameSourceDup,
    notifyReason: config.notifyOnSameSourceDup ? 'repeat_submit' : 'suppressed_same_source',
  });
}

function writeLedger(ledger, record) {
  if (!ledger.leads) ledger.leads = {};
  if (!ledger.phones) ledger.phones = {};
  if (record.email_canonical) ledger.leads[record.email_canonical] = record;
  else if (record.phone_digits) ledger.leads[`phone:${record.phone_digits}`] = record;
  if (record.phone_digits) {
    ledger.phones[record.phone_digits] = record.email_canonical || `phone:${record.phone_digits}`;
  }
}

function slackText(decision, record, captureSource, notifyReason) {
  const name = record.full_name || record.email_canonical || record.phone_e164;
  const sources = (record.all_sources || []).join(' + ');
  switch (decision) {
    case 'new':
      return `NEW lead via ${captureSource.toUpperCase()} · ${name} · email ${record.email_canonical || '—'} · first_source=${record.first_source}`;
    case 'duplicate_new_source':
      return `Existing contact, new channel ${captureSource.toUpperCase()} · ${name} · first seen via ${record.first_source} · sources: ${sources}`;
    case 'review_phone_collision':
      return `Possible duplicate (same phone, different email) via ${captureSource.toUpperCase()} · ${name}`;
    default:
      return `Lead event ${notifyReason} via ${captureSource} · ${name}`;
  }
}

function buildOutput({
  decision,
  reason,
  identity,
  person,
  captureSource,
  attribution,
  ledgerRecord,
  existing,
  config,
  now,
  crmAction,
  shouldNotify,
  notifyReason,
  collision,
}) {
  const record = ledgerRecord;
  const sendSlack = Boolean(shouldNotify && config.slackWebhookUrl);
  const shouldUpsert = Boolean(crmAction !== 'skip' && config.hubspotToken);

  const sourceProperties = record
    ? {
        lead_capture_source: captureSource,
        lead_first_source: record.first_source,
        lead_all_sources: (record.all_sources || []).join(';'),
        lead_last_source: record.last_source,
        lead_paid_attribution: attribution.paid,
        lead_original_email: record.email_original,
      }
    : {};
  const hubspotProperties = record
    ? {
        email: record.email_canonical,
        firstname: record.first_name,
        lastname: record.last_name,
        phone: record.phone_e164,
      }
    : {};
  const properties = { ...hubspotProperties, ...sourceProperties };

  return {
    ok: decision !== 'quarantine',
    decision,
    reason,
    product: 'speed-to-lead',
    received_at: nowIso(now),
    identity,
    person,
    source: {
      capture: captureSource,
      first_source: record ? record.first_source : captureSource,
      last_source: record ? record.last_source : captureSource,
      all_sources: record ? record.all_sources : [captureSource],
      new_source: record && existing ? !existing.all_sources.includes(captureSource) : true,
      paid_attribution: attribution.paid,
    },
    attribution,
    ledger: record
      ? {
          hit_count: record.hit_count,
          first_seen_at: record.first_seen_at,
          last_seen_at: record.last_seen_at,
          minutes_since_last_touch: existing ? minutesBetween(existing.last_seen_at, now) : 0,
        }
      : null,
    collision: collision || null,
    notify: {
      should_notify: shouldNotify,
      send_slack: sendSlack,
      reason: notifyReason,
      slack_webhook_url: config.slackWebhookUrl,
      slack_payload: {
        text: record ? slackText(decision, record, captureSource, notifyReason) : `Quarantined lead (${reason})`,
      },
    },
    crm: {
      action: crmAction,
      should_upsert: shouldUpsert,
      provider: 'hubspot',
      token: config.hubspotToken,
      properties,
      hubspot_properties: hubspotProperties,
    },
    config: {
      hot_window_minutes: config.hotWindowMinutes,
      has_slack: Boolean(config.slackWebhookUrl),
      has_hubspot: Boolean(config.hubspotToken),
    },
  };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    GMAIL_DOMAINS,
    canonicalizeEmail,
    canonicalizePhone,
    inferCaptureSource,
    inferPaidAttribution,
    unwrapPayload,
    processLead,
    emptyLedger,
    pathHintFromWebhookUrl,
  };
}
