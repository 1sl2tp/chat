/* Canonical bill decision rules: AI extracts fields, code decides. No network or ledger writes. */
(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root && typeof root === 'object') root.ChatBankBillRules = api;
})(typeof window === 'object' ? window : null, function () {
  'use strict';
  const MAX_AMOUNT_VND = 1000000000000;
  const FINAL_STATES = new Set(['received', 'historical_reference']);
  function plain(value) { return String(value == null ? '' : value).trim(); }
  function canonicalName(value) {
    return plain(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/\s+/g, ' ').toUpperCase();
  }
  function bankCode(value) {
    const v = canonicalName(value);
    if (/AGRIBANK|NONG NGHIEP|NHNN/.test(v)) return 'AGRIBANK';
    if (/VIETINBANK|CONG THUONG/.test(v)) return 'VIETINBANK';
    if (/TECHCOMBANK|KY THUONG/.test(v)) return 'TECHCOMBANK';
    if (/VIETCOMBANK|NGOAI THUONG/.test(v)) return 'VIETCOMBANK';
    if (/\bBIDV\b|DAU TU VA PHAT TRIEN/.test(v)) return 'BIDV';
    if (/\bVPBANK\b/.test(v)) return 'VPBANK';
    return v.replace(/[^A-Z0-9]/g, '');
  }
  function recipientAccount(value) {
    const raw = plain(value);
    if (!raw || /[xX*•…_?]/.test(raw)) return '';
    if (!/^[\d\s.\-]+$/.test(raw)) return '';
    return raw.replace(/\D/g, '');
  }
  function normalizedReference(value) {
    return plain(value).toUpperCase().replace(/\s+/g, '');
  }
  function exactAmount(value) {
    if (typeof value === 'number') return Number.isSafeInteger(value) ? value : null;
    const v = plain(value).replace(/[đ₫]|VND/gi, '').replace(/\s+/g, '');
    if (!v || !/^(?:\d+|\d{1,3}(?:[.,]\d{3})+)$/.test(v)) return null;
    const amount = Number(v.replace(/[.,]/g, ''));
    return Number.isSafeInteger(amount) ? amount : null;
  }
  function parseTransactionVietnam(value) {
    const s = plain(value);
    let a;
    const viet = s.match(/^(\d{1,2})\s*thg\s*(\d{1,2})[,\s]+(\d{4})(?:\s*l[uú]c\s*(\d{1,2}):(\d{2})(?::(\d{2}))?)?/i);
    const euro = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})(?:\s*(?:l[uú]c\s*)?(\d{1,2}):(\d{2})(?::(\d{2}))?)?/i);
    const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{1,2}):(\d{2})(?::(\d{2}))?/);
    if (viet || euro) a = (viet || euro).slice(1);
    else if (iso) a = [iso[3], iso[2], iso[1], iso[4], iso[5], iso[6]];
    else return null;
    const [dd, mm, yyyy, h, min, sec] = a.map(v => v === undefined ? undefined : Number(v));
    if (h === undefined || min === undefined) return null;
    if (![dd,mm,yyyy,h,min].every(Number.isInteger) || (sec !== undefined && !Number.isInteger(sec))) return null;
    if (yyyy < 2020 || yyyy > 2100 || mm < 1 || mm > 12 || dd < 1 || h > 23 || min > 59 || (sec !== undefined && sec > 59)) return null;
    if (new Date(Date.UTC(yyyy,mm - 1,dd)).getUTCDate() !== dd) return null;
    const date = yyyy + '-' + String(mm).padStart(2,'0') + '-' + String(dd).padStart(2,'0');
    const minute = String(h).padStart(2,'0') + ':' + String(min).padStart(2,'0');
    return { date, minute, second:sec === undefined ? null : sec, keyMinute:date + 'T' + minute, secondsKnown:sec !== undefined };
  }
  function vietnamSentDate(iso) {
    const d = new Date(plain(iso));
    if (!Number.isFinite(d.getTime())) return null;
    return new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Ho_Chi_Minh',year:'numeric',month:'2-digit',day:'2-digit'})
      .format(d).replace(/\//g,'-');
  }
  function bankAccountAllowed(account, receivingBank) {
    const code = bankCode(receivingBank);
    return (account === '2901181999999' && code === 'AGRIBANK') ||
      (account === '197981999999' && code === 'VIETINBANK');
  }
  function normalize(raw, meta) {
    const b = raw || {}, m = meta || {};
    return {
      asset_id:plain(m.asset_id), customer_id:plain(m.customer_id),
      image_sha256:/^[a-f0-9]{64}$/i.test(plain(m.image_sha256)) ? plain(m.image_sha256).toLowerCase() : '',
      image_size_bytes:Number(m.image_size_bytes) || null,
      width_px:Number(m.width_px) || null, height_px:Number(m.height_px) || null,
      sent_at:plain(m.sent_at),
      is_bank_receipt:b.is_bank_receipt === true,
      success:b.transfer_success === true,
      amount_vnd:exactAmount(b.amount_vnd),
      receiving_name:canonicalName(b.receiving_name),
      receiving_account:recipientAccount(b.receiving_account),
      receiving_bank:bankCode(b.receiving_bank),
      sending_bank:bankCode(b.sending_bank),
      transfer_reference:normalizedReference(b.transfer_reference),
      transfer_at:parseTransactionVietnam(b.transaction_datetime_vn)
    };
  }
  function isPriorRelevant(p) { return FINAL_STATES.has(plain(p.status)); }
  function findPrior(candidate, registry) {
    let suspected = null;
    for (const source of Array.isArray(registry) ? registry : []) {
      const p = source || {};
      if (!isPriorRelevant(p)) continue;
      if (candidate.asset_id && plain(p.asset_id || p.media_asset_id) === candidate.asset_id) return {kind:'duplicate_asset',source:p};
      if (candidate.image_sha256 && plain(p.image_sha256).toLowerCase() === candidate.image_sha256) return {kind:'duplicate_hash',source:p};
      if (candidate.transfer_reference && candidate.sending_bank &&
          normalizedReference(p.transfer_reference) === candidate.transfer_reference &&
          bankCode(p.sending_bank) === candidate.sending_bank) return {kind:'duplicate_reference',source:p};
      const theirTime = p.transfer_at && typeof p.transfer_at === 'object' && p.transfer_at.keyMinute
        ? p.transfer_at : parseTransactionVietnam(p.transfer_at);
      if (theirTime && candidate.transfer_at && theirTime.keyMinute === candidate.transfer_at.keyMinute &&
          exactAmount(p.amount_vnd) === candidate.amount_vnd &&
          recipientAccount(p.receiving_account) === candidate.receiving_account &&
          canonicalName(p.receiving_name) === candidate.receiving_name) {
        suspected = suspected || {kind:'suspected_same_amount_time',source:p};
      }
    }
    return suspected;
  }
  function evaluate(raw, meta, registry = []) {
    const b = normalize(raw,meta);
    const match = findPrior(b,registry);
    if (match && match.kind.startsWith('duplicate')) return verdict('duplicate',match.kind,b,match.source);
    if (!b.is_bank_receipt) return verdict('review','not_a_bank_receipt',b);
    if (!b.success) return verdict('review','transfer_success_not_verified',b);
    if (b.amount_vnd === null || b.amount_vnd <= 0 || b.amount_vnd >= MAX_AMOUNT_VND || b.amount_vnd % 1000 !== 0)
      return verdict('review','invalid_or_non_thousand_amount',b);
    if (!b.receiving_name || !b.receiving_account || !b.receiving_bank) return verdict('review','recipient_unreadable',b);
    if (b.receiving_name !== 'BUI XUAN TUNG') return verdict('hold','wrong_receiving_name',b);
    if (b.receiving_account !== '2901181999999' && b.receiving_account !== '197981999999') {
      return verdict(b.receiving_account.length < 12 ? 'review' : 'hold',
        b.receiving_account.length < 12 ? 'recipient_account_unreadable' : 'wrong_receiving_account',b);
    }
    if (!bankAccountAllowed(b.receiving_account,b.receiving_bank)) return verdict('hold','wrong_receiving_bank',b);
    if (!b.transfer_at || !vietnamSentDate(b.sent_at)) return verdict('review','datetime_missing_or_invalid',b);
    if (b.transfer_at.date !== vietnamSentDate(b.sent_at)) return verdict('hold','transfer_day_differs_from_sent_day_vn',b);
    if (!b.transfer_reference && !b.image_sha256) return verdict('review','no_reference_and_no_image_hash',b);
    if (b.transfer_reference && !b.sending_bank) return verdict('review','sending_bank_missing_for_reference_dedup',b);
    if (match) return verdict('review',match.kind,b,match.source);
    return verdict('received','valid_new_bill',b);
  }
  function verdict(status, reason, bill, prior) {
    return {
      status,reason,
      original_amount_vnd:bill.amount_vnd,
      collection_thousands:status === 'received' ? bill.amount_vnd / 1000 : null,
      ledger_amount_thousands:status === 'received' ? -(bill.amount_vnd / 1000) : null,
      transaction_ref:bill.transfer_reference || null,
      transaction_at_vn:bill.transfer_at && bill.transfer_at.keyMinute || null,
      duplicate_of:prior ? (prior.id || prior.media_asset_id || prior.asset_id || null) : null,
      normalized:bill
    };
  }
  return Object.freeze({canonicalName,bankCode,recipientAccount,normalizedReference,exactAmount,
    parseTransactionVietnam,vietnamSentDate,bankAccountAllowed,normalize,findPrior,evaluate});
});
