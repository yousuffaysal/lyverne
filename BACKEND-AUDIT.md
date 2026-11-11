# Backend and admin workflow audit

The order workflow and all active admin tabs were reviewed. Verification uses the real Worker, an isolated migrated SQLite database, signed test JWTs, and the actual workspace controller with an isolated DOM/API boundary. The configured production PostgreSQL database was inspected read-only for schema, policies and grants. No production orders or customer records were created or edited.

## Completed in source

- Checkout and saved address: validated primary and optional alternative mobile numbers, division, district, upazila/thana, optional free-text union/ward/locality, detailed address and postcode. Each order also accepts an optional delivery note.
- Bengali mobile digits are normalized. Invalid contact details, mismatched districts and excessive field lengths are rejected before stock is reserved.
- Orders preserve their delivery snapshot independently of later profile edits. Customer delivery notes remain separate from private staff notes.
- Admin order details display both phone numbers, the complete address and the customer note, with a copy action.
- Admin has all five selectable fulfilment stages: Confirmed, Being packed, On the way, Out for delivery, Delivered. Cancellation is separate; terminal orders cannot be reopened.
- Customer order lists and tracking automatically refresh every 5 seconds while visible and not editing. Every order is refreshed, including new orders. Core admin views refresh every 15 seconds. Returning to a visible tab triggers a refresh.
- Status changes, event history, stock restoration and the activity record now share one transaction. A failed or stale update cannot partially commit a cancellation.
- The store must supply actual tracking details and delivery estimates; status changes no longer invent courier numbers or arrival dates.
- Admin tabs reviewed: overview, orders, team orders, products, inventory, promotions, customers, people, work board, analytics, AI companion, activity and settings. Direct links to lazily loaded tabs now fetch their data before rendering. Admin logout remains visible on mobile.
- Staff messaging is hidden and its API is disabled. Existing messages are preserved. Messaging functionality was excluded from the audit; only the disabled boundary was checked.
- Invalid JSON form shapes and impossible delivery dates are refused cleanly.

## Live database findings and prepared fixes

Read-only inspection confirmed the database is reachable and row-level security is enabled on the operational tables. Existing table columns match the project before the new delivery additions.

1. The initial audit found eight new delivery columns absent in production; these are now applied. `0008_delivery_details.sql` adds these with empty defaults, preserving existing rows.
2. The initial audit found authenticated clients had column access to their own order's private staff note through the direct database API, despite the Worker filtering it. Client roles also hold unnecessary table privileges. `0009_store_client_grants.sql` limits direct reads to safe order columns, removes unused mutation/TRUNCATE permissions, and preserves the existing row ownership policies. The Worker table owner retains access.
3. The initial live migration ledger recorded only the first three migrations, although later tables/columns already existed. The runner reapplied the idempotent 0004–0007 migrations and reconciled their ledger entries.

After the user explicitly approved the live database migration, the runner successfully applied 0004–0009. Read-only verification confirmed all eight delivery columns, restricted internal note/request-key access, zero unnecessary client INSERT/DELETE/TRUNCATE/TRIGGER table grants, preserved backend write access, and enabled row-level security. The public products, regions and anonymous account APIs returned HTTP 200 with the expected response shapes. Application code publication remains pending; this approval covered the database migration.

## Verification

- `node --test tests/*.test.mjs`: **113 passed, 0 failed**.
- `npm run build`: passed.
- `git diff --check`: passed.
- Integration coverage includes the complete five-stage admin-to-customer API journey, full delivery persistence, invalid-input stock protection, ownership boundaries, cancellation rollback, product management, promotions, team roles and tasks, and the disabled messaging boundary.
- Workspace controller coverage includes every active admin tab, initial deep links, all five admin stage controls, delivery form fields, whole-list customer polling, and preserving an open editor during refresh.

These checks do not certify a live browser session or a production order write flow. The PostgreSQL migrations and resulting privileges are now verified. Publish the matching application code before expecting the new form fields, disabled messaging UI, and updated polling behavior on the live site.
