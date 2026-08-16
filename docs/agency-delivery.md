# Agency delivery (1-day install)

This is the install path for a client n8n. Do not skip the Gmail canonicalization check — that is the demo that closes.

## Day-of

1. Import `workflows/stl-speed-to-lead.json` into the client n8n (or this local instance).
2. Publish the workflow.
3. Point Meta Lead Ads (or a Zap/Make middle hop) at `POST /webhook/stl/meta`.
4. Point Google Lead Form webhook at `POST /webhook/stl/google`.
5. Point the website form at `POST /webhook/stl/website`.
6. Paste Slack incoming webhook + HubSpot token into `CONFIG` in **Identity**.
7. Send one real test lead from each channel using the **same Gmail address** with a `+tag` on Meta.

Expected: one CRM contact, `first_source=meta`, `all_sources=meta;google;website` (if all three fired), Slack only for the first and for each *new channel*, not for the hot-window repeats.

## What you quote

- Install: wire three sources, Slack, HubSpot (or GHL later).
- Retainer: watch hot-window false positives, add new form fields, keep `first_source` honest when they add TikTok/LinkedIn later.

## What you do not promise

- Fuzzy name matching (“Jon” vs “John”).
- Household-level dedup.
- Silent merge on shared clinic/front-desk phone numbers.

Those are how other automations create the mess this product is hired to stop.
