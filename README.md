# Speed-to-lead

n8n workflow: inbound leads from Meta, Google, and a website form, tagged by source, deduped by email before Slack or HubSpot.

## Use it

1. In n8n: **⋯ → Import from File**
2. Import [`workflows/stl-speed-to-lead.json`](workflows/stl-speed-to-lead.json)
3. Turn **Published** on. Leave it on. Do not use Execute for live leads.

Then send leads here:

- `POST /webhook/stl/meta`
- `POST /webhook/stl/google`
- `POST /webhook/stl/website`

Same email from two channels = one contact. `first_source` stays. Slack only fires when it is actually new (or a new channel).
