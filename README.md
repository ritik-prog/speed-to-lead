# Speed-to-lead

n8n workflow: inbound leads from Meta, Google, and a website form, tagged by source, deduped by email before Slack or HubSpot.

## Use it

1. In n8n: **⋯ → Import from File**
2. Import [`stl-speed-to-lead.json`](stl-speed-to-lead.json)
3. Turn **Published** on. Leave it on. Do not use Execute for live leads.

Then send leads here:

- `POST /webhook/stl/meta`
- `POST /webhook/stl/google`
- `POST /webhook/stl/website`

Same email from two channels = one contact. `first_source` stays. Slack only fires when it is actually new (or a new channel).

## What it does

- **Canonical email** — `priya.shah+meta@gmail.com` and `priyashah@gmail.com` are one person (Gmail dots and plus-tags only).
- **Source tagging** — `first_source` is the first channel that saw them and never changes. `all_sources` grows when they arrive again on another channel.
- **Capture vs paid** — a website form with a `gclid` is still website capture with Google paid attribution.
- **Noise control** — same person within 15 minutes does not ping sales (ad platforms retry). A *new channel* still notifies. Same phone + different email is flagged, not silently merged.

## Decisions

| `decision` | CRM | Sales notify |
| --- | --- | --- |
| `new` | create | yes |
| `duplicate_new_source` | update, add source tag | yes (existing contact, new channel) |
| `duplicate_same_source` | update | no |
| `duplicate_hot_window` | update last seen | no |
| `review_phone_collision` | create (do not merge) | yes, as possible duplicate |
| `quarantine` | skip | no |

## Config

In the **Identity** node, edit `CONFIG`:

- `slackWebhookUrl` — Slack incoming webhook (blank = skip)
- `hubspotToken` — HubSpot private app token (blank = skip CRM; dedup still runs)
- `hotWindowMinutes` — default `15`
- `adminToken` — change `stl-dev` before any client install

HubSpot is upserted on canonical `email` with stock properties only (`email`, `firstname`, `lastname`, `phone`). Extra source fields are returned on `crm.properties` for you to map.

The ledger is a JSON file at `/home/node/stl-data/stl-ledger.json`. The n8n process must be able to read and write that path.

## Ops

`POST /webhook/stl/admin` with `token` matching `adminToken`:

- `action=peek` — inspect the ledger
- `action=reset` — clear the ledger
