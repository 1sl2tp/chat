-- NCC-010: one canonical TAPHOA product code, three separately preserved names.
-- Admin-reviewed alias only: supplier OCR must NEVER update prices, inventory,
-- debtor balance or TAPHOA product catalog.
CREATE TABLE IF NOT EXISTS public.chat_ncc_product_aliases (
 alias_key text PRIMARY KEY,
 invoice_name text NOT NULL CHECK (length(btrim(invoice_name)) BETWEEN 1 AND 180),
 product_code text NOT NULL REFERENCES public.taphoa_products(product_code) ON UPDATE CASCADE ON DELETE RESTRICT,
 approved_by uuid NOT NULL,
 approved_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT chat_ncc_product_alias_key_valid CHECK (length(alias_key) BETWEEN 2 AND 180)
);
CREATE INDEX IF NOT EXISTS chat_ncc_product_alias_product_idx
 ON public.chat_ncc_product_aliases(product_code);

CREATE TABLE IF NOT EXISTS public.chat_ncc_product_vietnamese_names (
 product_code text PRIMARY KEY REFERENCES public.taphoa_products(product_code) ON UPDATE CASCADE ON DELETE RESTRICT,
 vietnamese_name text NOT NULL CHECK (length(btrim(vietnamese_name)) BETWEEN 1 AND 180),
 approved_by uuid NOT NULL,
 approved_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.chat_ncc_product_aliases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_ncc_product_vietnamese_names ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.chat_ncc_product_aliases FROM anon,authenticated;
REVOKE ALL ON public.chat_ncc_product_vietnamese_names FROM anon,authenticated;
GRANT SELECT,INSERT,UPDATE ON public.chat_ncc_product_aliases TO service_role;
GRANT SELECT,INSERT,UPDATE ON public.chat_ncc_product_vietnamese_names TO service_role;
COMMENT ON TABLE public.chat_ncc_product_aliases IS
 'NCC AI invoice printed names linked to TAPHOA product codes, only after Admin approval';
COMMENT ON TABLE public.chat_ncc_product_vietnamese_names IS
 'Admin-approved Vietnamese display names for TAPHOA product codes; not a rewrite of canonical TAPHOA names';

-- Read-only price observations of the Admin-confirmed invoice mapping.
-- These are evidence, NOT an instruction to update taphoa_products.input_price_vnd.
CREATE TABLE IF NOT EXISTS public.chat_ncc_product_purchase_evidence (
 approved_by uuid NOT NULL,
 invoice_hash text NOT NULL CHECK (invoice_hash ~ '^[0-9a-f]{64}$'),
 row_no integer NOT NULL CHECK (row_no BETWEEN 1 AND 120),
 product_code text NOT NULL REFERENCES public.taphoa_products(product_code) ON UPDATE CASCADE ON DELETE RESTRICT,
 invoice_name text NOT NULL CHECK (length(btrim(invoice_name)) BETWEEN 1 AND 180),
 printed_unit text,
 quantity numeric(15,3) CHECK (quantity IS NULL OR quantity > 0),
 gross_unit_price_vnd numeric(16,2) CHECK (gross_unit_price_vnd IS NULL OR gross_unit_price_vnd >= 0),
 net_unit_price_vnd numeric(16,2) CHECK (net_unit_price_vnd IS NULL OR net_unit_price_vnd >= 0),
 price_evidence_state text NOT NULL CHECK (price_evidence_state IN
   ('after_discount_calculated','printed_before_discount','price_missing')),
 approved_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(approved_by,invoice_hash,row_no)
);
CREATE INDEX IF NOT EXISTS chat_ncc_purchase_code_date_idx
 ON public.chat_ncc_product_purchase_evidence(product_code,approved_at DESC);
ALTER TABLE public.chat_ncc_product_purchase_evidence ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.chat_ncc_product_purchase_evidence FROM anon,authenticated;
GRANT SELECT,INSERT,UPDATE ON public.chat_ncc_product_purchase_evidence TO service_role;
COMMENT ON TABLE public.chat_ncc_product_purchase_evidence IS
 'Historical invoice price evidence by canonical product code. Never automatically updates TAPHOA cost, sale or stock.';
