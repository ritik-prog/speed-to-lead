// n8n Code node wrapper. CONFIG is the only block to edit after install.

const CONFIG = {
  hotWindowMinutes: 15,
  slackWebhookUrl: '',
  hubspotToken: '',
  notifyOnNewSource: true,
  notifyOnSameSourceDup: false,
  defaultPhoneRegion: 'IN',
  adminToken: 'stl-dev',
};

function incomingWebhook() {
  const names = ['Meta', 'Google', 'Website', 'Ops'];
  for (const name of names) {
    try {
      if ($(name).isExecuted) return $(name).first().json;
    } catch (error) {
      /* not this trigger */
    }
  }
  return $input.first().json;
}

function unwrapLedger(parsed) {
  if (!parsed) return null;
  if (Array.isArray(parsed)) return unwrapLedger(parsed[0]);
  if (parsed.leads && typeof parsed.leads === 'object') {
    return {
      leads: parsed.leads,
      phones: parsed.phones && typeof parsed.phones === 'object' ? parsed.phones : {},
    };
  }
  if (parsed.data) return unwrapLedger(parsed.data);
  return null;
}

function loadLedger() {
  return unwrapLedger($input.first().json) || { leads: {}, phones: {} };
}

const item = incomingWebhook();
const ledger = loadLedger();
const query = item.query || {};
const body = item.body && typeof item.body === 'object' ? item.body : {};
const pathHint = (function () {
  const url = item.webhookUrl || '';
  const match = String(url).match(/stl\/(meta|google|website|admin|health)\b/i);
  return match ? match[1].toLowerCase() : '';
})();

const runtime = {
  mode: typeof $execution !== 'undefined' ? $execution.mode : 'unknown',
  execution_id: typeof $execution !== 'undefined' ? $execution.id : null,
};

if (pathHint === 'admin') {
  const token = String(query.token || body.token || '');
  if (token !== CONFIG.adminToken) {
    return [{ json: { ok: false, error: 'unauthorized', runtime, ledger_state: ledger } }];
  }
  const action = String(query.action || body.action || 'peek');
  if (action === 'reset') {
    const empty = { leads: {}, phones: {} };
    return [{ json: { ok: true, action: 'reset', leads: 0, runtime, ledger_state: empty } }];
  }
  return [
    {
      json: {
        ok: true,
        action: 'peek',
        lead_count: Object.keys(ledger.leads).length,
        leads: ledger.leads,
        runtime,
        ledger_state: ledger,
      },
    },
  ];
}

const payload = processLead(item, ledger, {
  config: CONFIG,
  pathHint,
  now: Date.now(),
});
payload.runtime = runtime;
payload.ledger_state = ledger;

return [{ json: payload }];
