# Questionnaire Client UX Review

Local implementation following the Studio365 browser review. Not a Production
release; no migration or database schema change.

## Client Journey

- One introduction explains existing website research, client validation and
  business context before the characterization meeting with Eitan.
- Synthetic client labels and crawl/product counts are not displayed in the
  introduction. Progress appears after starting the questionnaire.
- Catalog confirmation uses clean product examples and explains that the client
  should identify missing product groups, not approve each SKU.
- Audience questions give examples without pretending an absent audience list
  exists. Discount questions explicitly request the maximum permitted discount.
- Asset guidance requests curated photoshoot folders. Access questions request
  the coordinating contact, never credentials.
- Answer inputs precede the compact unknown/meeting options. Forward movement
  checks every preceding displayed question; an explicit unknown/meeting answer
  is permitted. Autosave, revision checks and submitted read-only state remain.

## Source Presentation

Policy and FAQ text is divided into RTL paragraphs and question headings. This
is deterministic presentation, not AI policy rewriting: original amounts,
conditions, exceptions, source evidence and questionnaire snapshots remain
unchanged. Catalog examples omit duplicated storefront pricing labels without
altering the stored product data. The original evidence remains accessible.

## Private Attachments

Optional asset attachments use the existing answers JSON, with no new tables.
Up to five files, 20 MiB each: PDF, PNG/JPEG/WebP, DOCX, TXT or ZIP. HTML, SVG and
executable extensions are not accepted. Files are not executed or unpacked.

Requires a **dedicated private Blob store** configured server-side through
`QUESTIONNAIRE_UPLOADS_READ_WRITE_TOKEN`. It never falls back to other Blob
credentials. Without that configuration the control is disabled and folder
links remain usable. No storage resource or environment binding was created
as part of this change.

Public authorization uses the existing bearer token, expiration/revocation,
origin checks and rate limit. Tokens are not added to file URLs or callback
payloads. Storage paths use an opaque questionnaire scope. A server receipt
binds verified file metadata to the questionnaire; forged/cross-questionnaire
attachments cannot be saved. Downloads require saved membership and public
link authorization or team authorization; delivery uses attachment disposition,
no-store, octet-stream, nosniff and a sandbox CSP.

Before enabling live storage, verify a complete upload/save/download cycle
against a dedicated isolated private store, decide retention/quota management
and abandoned-upload cleanup, and review malware scanning requirements. File
content is not antivirus-scanned or content-sniffed by this V1 implementation.
An in-flight upload after token revocation may leave an orphaned object, but it
cannot be verified or attached through the revoked link.

## Validation Boundaries

Unit tests include formatting, preserved policy conditions, navigation
completeness, metadata limits, HMAC receipts, cross-questionnaire isolation and
server paths with in-memory storage adapters. Browser regression uses the
guarded synthetic validation database and mocked customer providers.
Private Blob round-trip validation is not claimed without a configured store.
