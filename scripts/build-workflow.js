#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const lib = fs.readFileSync(path.join(root, 'src/lib/stl.js'), 'utf8').replace(
  /\nif \(typeof module !== 'undefined'[\s\S]*$/,
  '\n',
);
const wrapper = fs.readFileSync(path.join(root, 'src/n8n-wrapper.js'), 'utf8');
const jsCode = `${lib.trim()}\n\n${wrapper.trim()}\n`;

const MAIN_ID = '7c2e1d0a-4f3b-4a91-9c6e-00a51eaa0001';

function node(partial) {
  return partial;
}

function webhook(id, name, httpMethod, webhookPath, y) {
  return node({
    id,
    name,
    type: 'n8n-nodes-base.webhook',
    typeVersion: 2.1,
    position: [0, y],
    webhookId: id,
    parameters: {
      httpMethod,
      path: webhookPath,
      responseMode: 'responseNode',
      options: {
        allowedOrigins: '*',
      },
    },
  });
}

function ifBoolean(id, name, expr, y) {
  return node({
    id,
    name,
    type: 'n8n-nodes-base.if',
    typeVersion: 2.2,
    position: [1680, y],
    parameters: {
      conditions: {
        options: {
          caseSensitive: true,
          leftValue: '',
          typeValidation: 'strict',
          version: 2,
        },
        conditions: [
          {
            id: `${id}-cond`,
            leftValue: expr,
            rightValue: true,
            operator: { type: 'boolean', operation: 'true', singleValue: true },
          },
        ],
        combinator: 'and',
      },
    },
  });
}

const main = {
  id: MAIN_ID,
  name: 'Speed-to-lead',
  active: false,
  nodes: [
    webhook('wh-meta', 'Meta', 'POST', 'stl/meta', 0),
    webhook('wh-google', 'Google', 'POST', 'stl/google', 180),
    webhook('wh-website', 'Website', 'POST', 'stl/website', 360),
    webhook('wh-ops', 'Ops', 'POST', 'stl/admin', 540),
    node({
      id: 'load',
      name: 'Load',
      type: 'n8n-nodes-base.readWriteFile',
      typeVersion: 1.1,
      position: [280, 240],
      continueOnFail: true,
      alwaysOutputData: true,
      retryOnFail: true,
      maxTries: 2,
      waitBetweenTries: 200,
      parameters: {
        operation: 'read',
        fileSelector: '/home/node/stl-data/stl-ledger.json',
        options: {},
      },
    }),
    node({
      id: 'parse',
      name: 'Parse',
      type: 'n8n-nodes-base.extractFromFile',
      typeVersion: 1.1,
      position: [500, 240],
      continueOnFail: true,
      alwaysOutputData: true,
      parameters: {
        operation: 'fromJson',
        binaryPropertyName: 'data',
        destinationKey: 'data',
        options: {},
      },
    }),
    node({
      id: 'identity',
      name: 'Identity',
      type: 'n8n-nodes-base.code',
      typeVersion: 2,
      position: [720, 240],
      parameters: { jsCode },
    }),
    node({
      id: 'snapshot',
      name: 'Snapshot',
      type: 'n8n-nodes-base.code',
      typeVersion: 2,
      position: [940, 240],
      parameters: {
        jsCode:
          "const state = $input.first().json.ledger_state || { leads: {}, phones: {} };\nreturn [{ json: state }];\n",
      },
    }),
    node({
      id: 'serialize',
      name: 'Serialize',
      type: 'n8n-nodes-base.convertToFile',
      typeVersion: 1.1,
      position: [1160, 240],
      parameters: {
        operation: 'toJson',
        mode: 'each',
        options: {},
      },
    }),
    node({
      id: 'save',
      name: 'Save',
      type: 'n8n-nodes-base.readWriteFile',
      typeVersion: 1.1,
      position: [1380, 240],
      retryOnFail: true,
      maxTries: 3,
      waitBetweenTries: 200,
      parameters: {
        operation: 'write',
        fileName: '/home/node/stl-data/stl-ledger.json',
        dataPropertyName: 'data',
        options: {},
      },
    }),
    node({
      id: 'continue',
      name: 'Continue',
      type: 'n8n-nodes-base.code',
      typeVersion: 2,
      position: [1600, 240],
      parameters: {
        jsCode: "return [{ json: $('Identity').first().json }];\n",
      },
    }),
    node({
      id: 'reply',
      name: 'Reply',
      type: 'n8n-nodes-base.code',
      typeVersion: 2,
      position: [1820, 80],
      parameters: {
        jsCode: `const j = $input.first().json;
const identity = j.identity || {};
const notify = j.notify || {};
const crm = j.crm || {};
return [{
  json: {
    ok: j.ok,
    decision: j.decision,
    reason: j.reason,
    received_at: j.received_at,
    identity: {
      email_canonical: identity.email_canonical || '',
      phone: identity.phone || {},
    },
    person: j.person || {},
    source: j.source || {},
    attribution: j.attribution || {},
    ledger: j.ledger,
    runtime: j.runtime,
    notify: { sent: Boolean(notify.should_notify), reason: notify.reason || '' },
    crm: { action: crm.action || 'skip' },
  },
}];
`,
      },
    }),
    node({
      id: 'respond',
      name: 'Respond',
      type: 'n8n-nodes-base.respondToWebhook',
      typeVersion: 1.5,
      position: [2040, 80],
      parameters: {
        respondWith: 'firstIncomingItem',
        options: {},
      },
    }),
    ifBoolean('if-slack', 'Notify?', '={{ $json.notify.send_slack }}', 0),
    node({
      id: 'slack',
      name: 'Slack',
      type: 'n8n-nodes-base.httpRequest',
      typeVersion: 4.2,
      position: [1900, -40],
      continueOnFail: true,
      retryOnFail: true,
      maxTries: 3,
      waitBetweenTries: 1000,
      parameters: {
        method: 'POST',
        url: '={{ $json.notify.slack_webhook_url }}',
        sendBody: true,
        specifyBody: 'json',
        jsonBody: '={{ JSON.stringify($json.notify.slack_payload) }}',
        options: { timeout: 10000 },
      },
    }),
    ifBoolean('if-crm', 'CRM?', '={{ $json.crm.should_upsert }}', 400),
    node({
      id: 'hubspot',
      name: 'HubSpot',
      type: 'n8n-nodes-base.httpRequest',
      typeVersion: 4.2,
      position: [1900, 400],
      continueOnFail: true,
      retryOnFail: true,
      maxTries: 3,
      waitBetweenTries: 1500,
      parameters: {
        method: 'POST',
        url: 'https://api.hubapi.com/crm/v3/objects/contacts/batch/upsert',
        sendHeaders: true,
        headerParameters: {
          parameters: [{ name: 'Authorization', value: '=Bearer {{ $json.crm.token }}' }],
        },
        sendBody: true,
        specifyBody: 'json',
        jsonBody:
          '={{ JSON.stringify({ inputs: [{ idProperty: "email", id: $json.crm.hubspot_properties.email, properties: $json.crm.hubspot_properties }] }) }}',
        options: { timeout: 15000 },
      },
    }),
  ],
  connections: {
    Meta: { main: [[{ node: 'Load', type: 'main', index: 0 }]] },
    Google: { main: [[{ node: 'Load', type: 'main', index: 0 }]] },
    Website: { main: [[{ node: 'Load', type: 'main', index: 0 }]] },
    Ops: { main: [[{ node: 'Load', type: 'main', index: 0 }]] },
    Load: { main: [[{ node: 'Parse', type: 'main', index: 0 }]] },
    Parse: { main: [[{ node: 'Identity', type: 'main', index: 0 }]] },
    Identity: { main: [[{ node: 'Snapshot', type: 'main', index: 0 }]] },
    Snapshot: { main: [[{ node: 'Serialize', type: 'main', index: 0 }]] },
    Serialize: { main: [[{ node: 'Save', type: 'main', index: 0 }]] },
    Save: { main: [[{ node: 'Continue', type: 'main', index: 0 }]] },
    Continue: {
      main: [
        [
          { node: 'Reply', type: 'main', index: 0 },
          { node: 'Notify?', type: 'main', index: 0 },
          { node: 'CRM?', type: 'main', index: 0 },
        ],
      ],
    },
    Reply: { main: [[{ node: 'Respond', type: 'main', index: 0 }]] },
    'Notify?': { main: [[{ node: 'Slack', type: 'main', index: 0 }], []] },
    'CRM?': { main: [[{ node: 'HubSpot', type: 'main', index: 0 }], []] },
  },
  settings: {
    executionOrder: 'v1',
    timezone: 'Asia/Kolkata',
    callerPolicy: 'workflowsFromSameOwner',
    saveManualExecutions: false,
    saveDataErrorExecution: 'all',
    saveDataSuccessExecution: 'all',
    executionTimeout: 60,
    availableInMCP: false,
  },
  pinData: {},
  meta: { templateCredsSetupCompleted: true },
};

fs.mkdirSync(path.join(root, 'workflows'), { recursive: true });
fs.writeFileSync(path.join(root, 'workflows/stl-speed-to-lead.json'), JSON.stringify(main, null, 2) + '\n');
console.log('Wrote workflows/stl-speed-to-lead.json');
