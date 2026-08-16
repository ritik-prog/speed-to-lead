# Speed-to-lead

An n8n workflow that takes inbound leads from Meta, Google, and a website form, tags where they came from, and **deduplicates by email before the CRM**.

Agencies that buy ads on more than one channel usually create three HubSpot contacts and three Slack pings for the same person. This stops that.

## What it does

1. **Canonical email** — `priya.shah+meta@gmail.com` and `priyashah@gmail.com` are one person (Gmail dots and plus-tags only).
2. **Source tagging** — `first_source` is the first channel that saw them and never changes. `all_sources` grows when they arrive again on another channel.
3. **Capture vs paid** — a website form with a `gclid` is still website capture with Google paid attribution.
4. **Noise control** — same person within 15 minutes does not ping sales (ad platforms retry). A *new channel* still notifies. Same phone + different email is flagged, not silently merged.

## Decisions

| `decision` | CRM | Sales notify |
| --- | --- | --- |
| `new` | create | yes |
| `duplicate_new_source` | update, add source tag | yes (existing contact, new channel) |
| `duplicate_same_source` | update | no |
| `duplicate_hot_window` | update last seen | no |
| `review_phone_collision` | create (do not merge) | yes, as possible duplicate |
| `quarantine` | skip | no |

## Endpoints

Publish the **Speed-to-lead** workflow in n8n. Production URLs (no editor click required):

| Method | Path | Source |
| --- | --- | --- |
| `POST` | `/webhook/stl/meta` | Meta Lead Ads |
| `POST` | `/webhook/stl/google` | Google Lead Form |
| `POST` | `/webhook/stl/website` | Site form / Typeform / Webflow |
| `POST` | `/webhook/stl/admin` | Peek or reset the ledger |

## Setup

Requires Docker and Node 20+. Port **5678** (not 5000).

```bash
git clone https://github.com/ritik-prog/speed-to-lead.git
cd speed-to-lead
npm test
bash scripts/run-n8n.sh
npm run import
```

Confirm the workflow is **Published**. Point Meta, Google, and the site form at the URLs above.

```bash
npm run demo
```

Expected:

1. Meta → `new`, Gmail `+tag` collapsed, `first_source=meta`
2. Google (same person) → `duplicate_new_source`, `all_sources=["meta","google"]`
3. Google again → `duplicate_hot_window`, no sales ping
4. Website form with `gclid` → `new`, capture `website`, paid attribution `google`
5. Form with no email or phone → `quarantine`

Leads are processed one at a time so two inbound posts cannot collide on the ledger.

### Config

In the **Identity** node, edit `CONFIG`:

- `slackWebhookUrl` — Slack incoming webhook (blank = skip)
- `hubspotToken` — HubSpot private app token (blank = skip CRM; dedup still runs)
- `hotWindowMinutes` — default `15`
- `adminToken` — change `stl-dev` before any client install

HubSpot is upserted on canonical `email` with stock properties only. Extra source fields are returned on `crm.properties` for you to map — see [docs/crm-mapping.md](docs/crm-mapping.md).

## Layout

```
src/lib/stl.js          identity, source, dedup (unit tested)
src/n8n-wrapper.js      n8n Code node + CONFIG
workflows/              import JSON
fixtures/               sample Meta / Google / website payloads
scripts/run-n8n.sh      local n8n
scripts/import.sh       publish into the container
scripts/test-leads.sh   hit live webhooks
docs/                   install notes and CRM mapping
```

After changing `src/`:

```bash
npm run build
npm run import
```

## License

Use and ship it. Point issues and PRs at this repo.
