# ADR 0002 — When files exist, the column stores the object key, never the URL

**Status:** accepted — Stage 01 (decision recorded before the problem exists)

## Context

At Stage 01 there is no file at all. The enrollment paperwork stays on paper at the registrar's
office, the report card is a screen and the announcement lives on the portal board. There is no
upload, no `document` table, no object storage — and none of it is created "for later", not as an
empty folder, not as an interface without an implementation.

Even so, one decision has to be settled before the first line of Stage 03 code is written:
**what the table stores once the file exists**. That is invariant I9.

Storing the full URL looks practical — you just drop it into the image's `src`. The price shows up
later, all at once: switching bucket, region or provider becomes a mass `UPDATE`; putting a CDN in
front (Stage 06) means rewriting URLs already persisted; a signed URL with an expiry does not fit
in a column, because what is stored grows stale. A URL is a delivery decision, and a delivery
decision does not belong to the data.

## Decision

When object storage arrives at Stage 03, the column will be called `document.object_key` and will
store **the object key** — the logical path inside the bucket, something like
`network/<network_id>/enrollment/<enrollment_id>/<uuid>.pdf`.

**Never `document.url`.** The URL is assembled at delivery time, from the key plus the environment
configuration (bucket, region, CDN domain, signature and expiry).

## Consequences

- Switching bucket, region or provider, or putting a CDN in front, is a configuration change, not
  a data migration.
- Signed URLs with an expiry become possible without a workaround: the key is stable, the URL is
  ephemeral.
- The column name is the reminder. `object_key` does not invite anyone to paste an `https://`
  address into it; `url` would.
- Today's cost is this file. That is the definition of a decision that is cheap now and expensive
  later.
