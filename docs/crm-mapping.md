# CRM mapping

Dedup happens **before** the CRM node. HubSpot’s own email unique is not enough, because it will not collapse Gmail aliases.

## What is sent automatically

When `CONFIG.hubspotToken` is set, the workflow upserts on `email` with stock HubSpot properties only:

- `email` (canonical)
- `firstname`
- `lastname`
- `phone` (E.164)

That upsert will not fail on a fresh portal.

## What you create on the client portal

Create these contact properties, then map them from `crm.properties` in the HubSpot node (or a second HTTP call):

| Property | Type | Why |
| --- | --- | --- |
| `lead_first_source` | dropdown (meta / google / website) | Never overwrite |
| `lead_last_source` | dropdown | Last intake |
| `lead_all_sources` | text | `meta;google` |
| `lead_capture_source` | dropdown | This event |
| `lead_paid_attribution` | dropdown (none / meta / google / mixed) | Click IDs |
| `lead_original_email` | text | What the form actually typed |

## GoHighLevel

Same idea: search contact by canonical email, then update tags `source-meta`, `source-google`, `source-website` instead of creating. Do not use the raw form email as the search key.

## Slack copy

The workflow already writes the line sales needs:

- New: `NEW lead via META · Priya Shah · email priyashah@gmail.com · first_source=meta`
- Multi-channel: `Existing contact, new channel GOOGLE · … · first seen via meta`
