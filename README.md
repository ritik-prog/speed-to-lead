# Speed-to-lead with source tagging + email dedup

EmaReach / ritiktechs n8n add-on for agencies that buy traffic on **Meta**, **Google**, and a **website form**, then dump every submit into the CRM as a new contact.

**You do not click Execute for live leads.** If **Speed-to-lead** is **Published** (green), that single workflow is already listening 24/7. Meta, Google, Website, and Ops are four doors into the **same** pipeline — only the door that received the POST runs. The orange Execute button is an editor test shot, not how production works.

Leads are processed **one at a time**. If Meta and Google fire together, the second waits so the email ledger cannot collide.

The product is not “a webhook.” It is:

1. Tag **capture source** correctly (which inbox handed you the lead).
2. Keep **paid attribution** separate (gclid / fbclid / utm).
3. Dedup by **canonical email** *before* HubSpot/GHL/Slack ever see it.
4. Answer the ad platform in milliseconds, then notify sales only when it is actually new.

## Why this sells

Typical agency stack: Meta Lead Ads + Google Lead Form + a WordPress/Webflow form, all writing contacts independently. HubSpot’s native email match fails on `priya.shah+meta@gmail.com` vs `priyashah@gmail.com`. Phone-based merge silently glues two staff members who share a clinic number.

This workflow:

- Collapses Gmail aliases (`dots` and `+tag`) before lookup.
- Never overwrites `first_source`.
- Grows `all_sources` when the same person arrives on a new channel.
- Suppresses Slack for 15 minutes on the same person (the hot window), except a *new channel* still notifies.
- Flags same-phone / different-email as **review**, not a merge.

## Live endpoints

While **Published**, these respond without anyone sitting in the editor:

| Method | Path | Use |
| --- | --- | --- |
| GET | `/healthz` | n8n process is up |
| POST | `/webhook/stl/meta` | Meta Lead Ads |
| POST | `/webhook/stl/google` | Google Lead Form |
| POST | `/webhook/stl/website` | Site form / Typeform / Webflow |
| POST | `/webhook/stl/admin` | Ops peek/reset (`token: stl-dev`) |

Local n8n: http://localhost:5678 — Docker restarts the container if the machine reboots (`unless-stopped`). Watch live traffic under **Executions**, not by pressing Execute.

## Decisions the workflow returns

| `decision` | CRM | Sales notify |
| --- | --- | --- |
| `new` | create | yes |
| `duplicate_new_source` | update + add source tag | yes (existing contact, new channel) |
| `duplicate_same_source` | update | no |
| `duplicate_hot_window` | update last seen | **no** |
| `review_phone_collision` | create (do not merge) | yes, as possible dup |
| `quarantine` | skip | no |

## Setup

n8n is already running in Docker as `n8n` on port **5678**. Ledger file access needs this extra volume (already applied on this machine):

```bash
bash scripts/run-n8n.sh
npm test
npm run build
npm run import
```

Open http://localhost:5678 and confirm **Speed-to-lead** shows **Published**. Leave it published. Do not use Execute for client traffic.

Then:

```bash
npm run demo
```

You should see:

1. Meta → `new`, `first_source=meta`, Gmail `+tag` collapsed
2. Google (same person, seconds later) → `duplicate_new_source`, `first_source` still `meta`, `all_sources=["meta","google"]`, sales *is* told it is a new channel
3. Google again → `duplicate_hot_window`, **no** sales ping
4. Website (different person, has gclid) → `new`, `capture=website`, `paid_attribution=google`
5. Incomplete form → `quarantine`

### Agency config

Edit the `CONFIG` object at the top of the **Identity** node:

- `slackWebhookUrl` — Slack incoming webhook. Leave blank to skip pings.
- `hubspotToken` — HubSpot private app token. Leave blank to skip CRM (dedup still runs).
- `hotWindowMinutes` — default 15.
- `adminToken` — change `stl-dev` before any client install.

Custom HubSpot properties (`lead_first_source`, `lead_all_sources`, …) are returned on `crm.properties` but **not** sent on the upsert, so a stock HubSpot portal does not reject the contact. Map those properties when you set the client up — see `docs/crm-mapping.md`.

## Project layout

```
src/lib/stl.js          identity + source + dedup (tested)
src/n8n-wrapper.js      n8n Code-node glue + CONFIG
workflows/              generated import JSON
fixtures/               Meta / Google / website payloads
scripts/run-n8n.sh      local n8n with ledger volume
scripts/import.sh       load into the local n8n container
scripts/test-leads.sh   hit live webhooks
docs/                   delivery + CRM mapping
```

Rebuild the workflow JSON after you change `src/`:

```bash
npm run build
```
