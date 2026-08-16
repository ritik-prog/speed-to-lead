# Source vs identity

## Capture source ≠ paid attribution

| Field | Meaning | Example |
| --- | --- | --- |
| `source.capture` | Which endpoint received the lead | `website` |
| `source.first_source` | First endpoint that ever saw this email | `meta` |
| `source.all_sources` | Every endpoint that has seen them | `["meta","google"]` |
| `source.paid_attribution` | Click IDs / UTM, independent of capture | website form with `gclid` → `google` |

A website thank-you form that still has a Google click id is **not** a Google lead. Tagging it as Google is how agencies lose “which inbox actually converted” reporting.

## Email canonicalization

Applied before any ledger or CRM write:

1. Trim, lowercase, NFKC.
2. For `gmail.com` / `googlemail.com` only: strip `+tag`, strip dots in the local part, map domain to `gmail.com`.
3. Other domains keep dots and plus — Microsoft 365 plus-aliases are not the same mailbox.

`priya.shah+meta@gmail.com` and `priyashah@gmail.com` are one person. `ada.lovelace@agency.com` and `adalovelace@agency.com` are not.

## Phone

E.164 with default region `IN`. Phone is a **hint**:

- Same email wins, always.
- Same phone + same missing email → treat as the same person.
- Same phone + **different** email → `review_phone_collision`. Create the second contact. Do not merge. Front desks share numbers.

## Hot window

Default 15 minutes. Same identity, any channel: update `last_seen_at`, do not ping sales. Meta and Google both retry; the CRM should not.

## Persistence

The live n8n workflow stores the ledger in `/home/node/stl-data/stl-ledger.json` inside the n8n container so it survives restarts and n8n’s JS task runner. That is correct for a single-n8n demo and a small client. For a busy ad account, replace the file with a Data Table or HubSpot email search — keep this library as the canonicalizer in front of it.
