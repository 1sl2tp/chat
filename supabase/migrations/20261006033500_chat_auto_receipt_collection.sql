-- Historical migration slot retained because this version was already applied once.
-- The automatic receipt/bill collection experiment was abandoned on 2026-10-06.
-- Fresh environments must not create any receipt scanner, trigger, job table, or automatic debt write.
-- Production cleanup is owned by 20261006050000_remove_receipt_auto_collection.sql.

begin;
commit;
