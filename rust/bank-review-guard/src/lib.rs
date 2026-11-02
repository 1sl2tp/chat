//! Read-only Rust prototype for an Agribank manual-collection review hint.
//!
//! NOT a bank-credit-to-bill proof, NOT a ledger writer, NOT deployed.
//! The JS/SQL production code remains authoritative.

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum ReceiptState {
    AmountRead,
    Review,
    Received,
    Other,
}

impl ReceiptState {
    fn can_be_reviewed(self) -> bool {
        matches!(self, Self::AmountRead | Self::Review)
    }
}

#[derive(Clone, Copy, Debug)]
pub struct Receipt<'a> {
    pub id: &'a str,
    pub customer_id: &'a str,
    pub amount_vnd: i64,
    /// Date computed in Asia/Ho_Chi_Minh by the caller. Not the bank clock.
    pub upload_day_vn: &'a str,
    pub receiving_account: &'a str,
    pub state: ReceiptState,
    pub linked_notice_id: Option<u64>,
    pub ledger_id: Option<u64>,
}

#[derive(Clone, Copy, Debug)]
pub struct ManualCredit<'a> {
    pub notice_id: u64,
    pub ledger_id: u64,
    pub customer_id: &'a str,
    pub amount_vnd: i64,
    /// Date from the bank's printed transfer clock, in Vietnam time.
    pub bank_day_vn: &'a str,
    /// Only true when the canonical server has already recorded a manual
    /// collection in the ledger. Merely receiving money is insufficient.
    pub already_collected: bool,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum ReviewHint {
    Unverified,
    /// A single already-collected bank credit warrants a human bill check.
    /// This variant MUST NEVER cause a receipt link or ledger write.
    PossibleManualCollection { notice_id: u64, ledger_id: u64 },
}

fn valid_day(day: &str) -> bool {
    let bytes = day.as_bytes();
    if bytes.len() != 10 || bytes[4] != b'-' || bytes[7] != b'-' {
        return false;
    }
    if !bytes.iter().enumerate().all(|(i, c)| i == 4 || i == 7 || c.is_ascii_digit()) {
        return false;
    }
    let year: u32 = day[0..4].parse().unwrap_or(0);
    let month: u32 = day[5..7].parse().unwrap_or(0);
    let date: u32 = day[8..10].parse().unwrap_or(0);
    if year < 2000 || !(1..=12).contains(&month) {
        return false;
    }
    let leap = year % 4 == 0 && (year % 100 != 0 || year % 400 == 0);
    let max_day = match month {
        2 => if leap { 29 } else { 28 },
        4 | 6 | 9 | 11 => 30,
        _ => 31,
    };
    (1..=max_day).contains(&date)
}

fn reviewable(receipt: &Receipt<'_>) -> bool {
    !receipt.id.is_empty()
        && !receipt.customer_id.is_empty()
        && receipt.amount_vnd > 0
        && receipt.state.can_be_reviewed()
        && receipt.linked_notice_id.is_none()
        && receipt.ledger_id.is_none()
        && valid_day(receipt.upload_day_vn)
        && {
            // JS canonical strips non-digits before checking the account
            // suffix. Keep this Rust prototype compatible with its exact
            // display-only behavior (not bank account verification).
            let digits: String = receipt.receiving_account.chars()
                .filter(|c| c.is_ascii_digit()).collect();
            digits.len() < 5 || digits.ends_with("99999")
        }
}

/// Returns only a review hint for an existing manual collection. It never
/// asserts that an image belongs to a bank transfer.
/// Multiple possible bills or credits deliberately produce Unverified.
pub fn manual_collection_review_hint(
    target: &Receipt<'_>,
    bills: &[Receipt<'_>],
    credits: &[ManualCredit<'_>],
) -> ReviewHint {
    if !reviewable(target) {
        return ReviewHint::Unverified;
    }

    let mut related = bills.iter().filter(|bill| {
        // JS deliberately includes a conflicting image even when its own
        // account field is wrong; do not hide competing evidence here.
        !bill.id.is_empty()
            && bill.state.can_be_reviewed()
            && bill.linked_notice_id.is_none()
            && bill.ledger_id.is_none()
            && valid_day(bill.upload_day_vn)
            && bill.customer_id == target.customer_id
            && bill.amount_vnd == target.amount_vnd
            && bill.upload_day_vn == target.upload_day_vn
    });
    match (related.next(), related.next()) {
        (Some(only), None) if only.id == target.id => {}
        _ => return ReviewHint::Unverified,
    }

    let mut manual = credits.iter().filter(|credit| {
        credit.already_collected
            && credit.notice_id > 0
            && credit.ledger_id > 0
            && credit.customer_id == target.customer_id
            && credit.amount_vnd == target.amount_vnd
            && credit.bank_day_vn == target.upload_day_vn
    });

    match (manual.next(), manual.next()) {
        (Some(only), None) => ReviewHint::PossibleManualCollection {
            notice_id: only.notice_id,
            ledger_id: only.ledger_id,
        },
        _ => ReviewHint::Unverified,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn bill() -> Receipt<'static> {
        Receipt {
            id: "sample-receipt",
            customer_id: "sample-customer",
            amount_vnd: 975_000,
            upload_day_vn: "2026-11-02",
            receiving_account: "******99999",
            state: ReceiptState::AmountRead,
            linked_notice_id: None,
            ledger_id: None,
        }
    }

    fn credit() -> ManualCredit<'static> {
        ManualCredit {
            notice_id: 180,
            ledger_id: 661,
            customer_id: "sample-customer",
            amount_vnd: 975_000,
            bank_day_vn: "2026-11-02",
            already_collected: true,
        }
    }

    fn check(b: Receipt<'_>, bank: ManualCredit<'_>) -> ReviewHint {
        manual_collection_review_hint(&b, &[b], &[bank])
    }

    #[test]
    fn one_previously_collected_credit_is_only_a_review_hint() {
        assert_eq!(
            check(bill(), credit()),
            ReviewHint::PossibleManualCollection {
                notice_id: 180,
                ledger_id: 661
            }
        );
    }

    #[test]
    fn receipt_requires_existing_manual_ledger_proof() {
        assert_eq!(
            check(bill(), ManualCredit { already_collected: false, ..credit() }),
            ReviewHint::Unverified
        );
        assert_eq!(
            check(bill(), ManualCredit { ledger_id: 0, ..credit() }),
            ReviewHint::Unverified
        );
        assert_eq!(
            check(bill(), ManualCredit { notice_id: 0, ..credit() }),
            ReviewHint::Unverified
        );
    }

    #[test]
    fn customer_amount_and_day_must_match() {
        assert_eq!(
            check(bill(), ManualCredit { customer_id: "someone-else", ..credit() }),
            ReviewHint::Unverified
        );
        assert_eq!(
            check(bill(), ManualCredit { amount_vnd: 974_999, ..credit() }),
            ReviewHint::Unverified
        );
        assert_eq!(
            check(bill(), ManualCredit { bank_day_vn: "2026-11-03", ..credit() }),
            ReviewHint::Unverified
        );
    }

    #[test]
    fn ambiguous_bills_or_bank_events_fail_closed() {
        let target = bill();
        let duplicate = Receipt { id: "second-image", ..target };
        let other_bank = ManualCredit { notice_id: 181, ledger_id: 662, ..credit() };
        assert_eq!(
            manual_collection_review_hint(&target, &[target, duplicate], &[credit()]),
            ReviewHint::Unverified
        );
        assert_eq!(
            manual_collection_review_hint(&target, &[target], &[credit(), other_bank]),
            ReviewHint::Unverified
        );
        assert_eq!(
            manual_collection_review_hint(&target, &[], &[credit()]),
            ReviewHint::Unverified
        );
    }

    #[test]
    fn paid_linked_invalid_or_other_receipts_cannot_be_relinked() {
        for state in [ReceiptState::Received, ReceiptState::Other] {
            assert_eq!(
                check(Receipt { state, ..bill() }, credit()),
                ReviewHint::Unverified
            );
        }
        assert_eq!(
            check(Receipt { linked_notice_id: Some(180), ..bill() }, credit()),
            ReviewHint::Unverified
        );
        assert_eq!(
            check(Receipt { ledger_id: Some(661), ..bill() }, credit()),
            ReviewHint::Unverified
        );
        assert_eq!(
            check(Receipt { amount_vnd: 0, ..bill() }, credit()),
            ReviewHint::Unverified
        );
        assert_eq!(
            check(Receipt { receiving_account: "*****99998", ..bill() }, credit()),
            ReviewHint::Unverified
        );
        assert!(matches!(
            check(Receipt { state: ReceiptState::Review, ..bill() }, credit()),
            ReviewHint::PossibleManualCollection { .. }
        ));
    }


    // Shared fixture contract with tests/test_rust_bank_review_parity_20261103.cjs.
    // Review hint NEVER authorizes a bill link or a ledger entry.
    #[test]
    fn cross_language_read_only_review_fixtures() {
        for line in include_str!("../fixtures/review_cases.tsv").lines() {
            if line.is_empty() || line.starts_with('#') { continue; }
            let parts: Vec<&str> = line.split('|').collect();
            assert_eq!(parts.len(), 7, "fixture columns: {line}");
            let [name, state, account, day, bank_kind, extra_kind, expected] =
                <[&str; 7]>::try_from(parts).expect("exactly 7 fields");
            let bill = Receipt {
                receiving_account: if account == "EMPTY" { "" } else { account },
                upload_day_vn: day,
                state: match state {
                    "amount_read" => ReceiptState::AmountRead,
                    "review" => ReceiptState::Review,
                    "received" => ReceiptState::Received,
                    _ => panic!("unknown bill state {state}"),
                },
                ..bill()
            };
            let mut credits = Vec::new();
            let mut credit = credit();
            match bank_kind {
                "collected" | "duplicate" => {},
                "uncollected" => credit.already_collected = false,
                "wrong_customer" => credit.customer_id = "other-customer",
                "wrong_amount" => credit.amount_vnd += 1,
                "wrong_day" => credit.bank_day_vn = "2026-11-03",
                "no_ledger" => credit.ledger_id = 0,
                "none" => {},
                _ => panic!("unknown bank kind {bank_kind}"),
            };
            if bank_kind != "none" { credits.push(credit); }
            if bank_kind == "duplicate" {
                credits.push(ManualCredit { notice_id: 181, ledger_id: 662, ..credit });
            }
            let mut bills = vec![bill];
            match extra_kind {
                "none" => {},
                "same" => bills.push(Receipt { id: "second-bill", ..bill }),
                "wrong_account" => bills.push(Receipt {
                    id: "second-bill", receiving_account: "0000012345", ..bill
                }),
                "linked" => bills.push(Receipt {
                    id: "second-bill", linked_notice_id: Some(777), ..bill
                }),
                _ => panic!("unknown bill kind {extra_kind}"),
            }
            let actual = manual_collection_review_hint(&bill, &bills, &credits);
            let got = if matches!(actual, ReviewHint::PossibleManualCollection { .. }) {
                "hint"
            } else { "review" };
            assert_eq!(got, expected, "shared fixture failed: {name}");
        }
    }

    #[test]
    fn invalid_business_dates_are_rejected_not_guessed() {
        for day in ["", "2026-11-32", "2026-02-29", "2026-13-02", "11/02/2026"] {
            assert_eq!(
                check(Receipt { upload_day_vn: day, ..bill() }, credit()),
                ReviewHint::Unverified
            );
        }
        assert!(valid_day("2028-02-29"));
        assert!(!valid_day("2100-02-29"));
    }
}
