(define-constant ERR-NOT-AUTHORIZED u100)
(define-constant ERR-INVALID-CLASS-ID u101)
(define-constant ERR-CLASS-NOT-COMPLETED u102)
(define-constant ERR-INVALID-TOTAL-AMOUNT u103)
(define-constant ERR-INVALID-SPLIT-PERCENTAGE u104)
(define-constant ERR-INVALID-INSTRUCTOR u105)
(define-constant ERR-INVALID-VENUE u106)
(define-constant ERR-INSUFFICIENT-ESCROW u107)
(define-constant ERR-TRANSFER-FAILED u108)
(define-constant ERR-PAYOUT-ALREADY-PROCESSED u109)
(define-constant ERR-INVALID-TIMESTAMP u110)
(define-constant ERR-AUTHORITY-NOT-VERIFIED u111)
(define-constant ERR-INVALID-PLATFORM-FEE u112)
(define-constant ERR-INVALID-PAYOUT-ID u113)
(define-constant ERR-MAX-PAYOUTS-EXCEEDED u114)
(define-constant ERR-INVALID-RECIPIENT u115)
(define-constant ERR-INVALID-CURRENCY u116)
(define-constant ERR-INVALID-STATUS u117)
(define-constant ERR-PAYOUT-NOT-FOUND u118)
(define-constant ERR-INVALID-UPDATE-PARAM u119)
(define-constant ERR-UPDATE-NOT-ALLOWED u120)

(define-data-var contract-owner principal tx-sender)
(define-data-var next-payout-id uint u0)
(define-data-var max-payouts uint u10000)
(define-data-var platform-fee uint u5)
(define-data-var escrow-contract (optional principal) none)
(define-data-var registry-contract (optional principal) none)

(define-map payouts
  uint
  {
    class-id: uint,
    total-amount: uint,
    instructor-split: uint,
    instructor-amount: uint,
    venue-amount: uint,
    platform-amount: uint,
    timestamp: uint,
    instructor: principal,
    venue: principal,
    status: bool
  }
)

(define-map payouts-by-class
  uint
  uint
)

(define-map payout-updates
  uint
  {
    update-split: uint,
    update-timestamp: uint,
    updater: principal
  }
)

(define-read-only (get-payout (id uint))
  (map-get? payouts id)
)

(define-read-only (get-payout-by-class (class-id uint))
  (map-get? payouts-by-class class-id)
)

(define-read-only (get-payout-updates (id uint))
  (map-get? payout-updates id)
)

(define-read-only (get-payout-history (class-id uint))
  (match (map-get? payouts-by-class class-id)
    payout-id (ok (map-get? payouts payout-id))
    (err ERR-PAYOUT-NOT-FOUND)
  )
)

(define-private (validate-class-id (id uint))
  (if (> id u0)
      (ok true)
      (err ERR-INVALID-CLASS-ID))
)

(define-private (validate-total-amount (amount uint))
  (if (> amount u0)
      (ok true)
      (err ERR-INVALID-TOTAL-AMOUNT))
)

(define-private (validate-split-percentage (split uint))
  (if (and (> split u0) (< split u100))
      (ok true)
      (err ERR-INVALID-SPLIT-PERCENTAGE))
)

(define-private (validate-instructor (p principal))
  (if (not (is-eq p tx-sender))
      (ok true)
      (err ERR-INVALID-INSTRUCTOR))
)

(define-private (validate-venue (p principal))
  (if (not (is-eq p tx-sender))
      (ok true)
      (err ERR-INVALID-VENUE))
)

(define-private (validate-timestamp (ts uint))
  (if (>= ts block-height)
      (ok true)
      (err ERR-INVALID-TIMESTAMP))
)

(define-private (validate-recipient (p principal))
  (if (is-eq p contract-caller)
      (ok true)
      (err ERR-INVALID-RECIPIENT))
)

(define-private (validate-currency (cur (string-utf8 20)))
  (if (or (is-eq cur u"STX") (is-eq cur u"USD"))
      (ok true)
      (err ERR-INVALID-CURRENCY))
)

(define-private (validate-status (status bool))
  (if status
      (ok true)
      (err ERR-INVALID-STATUS))
)

(define-private (validate-principal (p principal))
  (if (not (is-eq p 'SP000000000000000000002Q6VF78))
      (ok true)
      (err ERR-NOT-AUTHORIZED))
)

(define-public (set-escrow-contract (contract-principal principal))
  (begin
    (asserts! (is-eq tx-sender (var-get contract-owner)) (err ERR-NOT-AUTHORIZED))
    (try! (validate-principal contract-principal))
    (asserts! (is-none (var-get escrow-contract)) (err ERR-AUTHORITY-NOT-VERIFIED))
    (var-set escrow-contract (some contract-principal))
    (ok true)
  )
)

(define-public (set-registry-contract (contract-principal principal))
  (begin
    (asserts! (is-eq tx-sender (var-get contract-owner)) (err ERR-NOT-AUTHORIZED))
    (try! (validate-principal contract-principal))
    (asserts! (is-none (var-get registry-contract)) (err ERR-AUTHORITY-NOT-VERIFIED))
    (var-set registry-contract (some contract-principal))
    (ok true)
  )
)

(define-public (set-platform-fee (new-fee uint))
  (begin
    (asserts! (is-eq tx-sender (var-get contract-owner)) (err ERR-NOT-AUTHORIZED))
    (asserts! (<= new-fee u10) (err ERR-INVALID-PLATFORM-FEE))
    (var-set platform-fee new-fee)
    (ok true)
  )
)

(define-public (set-max-payouts (new-max uint))
  (begin
    (asserts! (is-eq tx-sender (var-get contract-owner)) (err ERR-NOT-AUTHORIZED))
    (asserts! (> new-max u0) (err ERR-INVALID-UPDATE-PARAM))
    (var-set max-payouts new-max)
    (ok true)
  )
)

(define-public (process-payout (class-id uint) (total-amount uint) (instructor-split uint) (instructor principal) (venue principal))
  (let (
        (next-id (var-get next-payout-id))
        (current-max (var-get max-payouts))
        (fee (var-get platform-fee))
        (escrow (unwrap! (var-get escrow-contract) (err ERR-AUTHORITY-NOT-VERIFIED)))
        (registry (unwrap! (var-get registry-contract) (err ERR-AUTHORITY-NOT-VERIFIED)))
        (class-status (try! (contract-call? registry get-class-status class-id)))
      )
    (asserts! (< next-id current-max) (err ERR-MAX-PAYOUTS-EXCEEDED))
    (try! (validate-class-id class-id))
    (try! (validate-total-amount total-amount))
    (try! (validate-split-percentage instructor-split))
    (try! (validate-instructor instructor))
    (try! (validate-venue venue))
    (asserts! class-status (err ERR-CLASS-NOT-COMPLETED))
    (asserts! (is-none (map-get? payouts-by-class class-id)) (err ERR-PAYOUT-ALREADY-PROCESSED))
    (let (
          (instructor-share (/ (* total-amount instructor-split) u100))
          (venue-share (/ (* total-amount (- u100 instructor-split)) u100))
          (platform-share (/ (* total-amount fee) u100))
          (adjusted-total (- total-amount platform-share))
          (adjusted-instructor (/ (* adjusted-total instructor-split) u100))
          (adjusted-venue (- adjusted-total adjusted-instructor))
        )
      (try! (as-contract (contract-call? escrow release-payment class-id total-amount)))
      (try! (stx-transfer? adjusted-instructor tx-sender instructor))
      (try! (stx-transfer? adjusted-venue tx-sender venue))
      (try! (stx-transfer? platform-share tx-sender (var-get contract-owner)))
      (map-set payouts next-id
        {
          class-id: class-id,
          total-amount: total-amount,
          instructor-split: instructor-split,
          instructor-amount: adjusted-instructor,
          venue-amount: adjusted-venue,
          platform-amount: platform-share,
          timestamp: block-height,
          instructor: instructor,
          venue: venue,
          status: true
        }
      )
      (map-set payouts-by-class class-id next-id)
      (var-set next-payout-id (+ next-id u1))
      (print { event: "payout-processed", id: next-id, class-id: class-id })
      (ok next-id)
    )
  )
)

(define-public (update-payout-split (payout-id uint) (new-split uint))
  (let ((payout (map-get? payouts payout-id)))
    (match payout
      p
        (begin
          (asserts! (is-eq (get instructor p) tx-sender) (err ERR-NOT-AUTHORIZED))
          (asserts! (not (get status p)) (err ERR-UPDATE-NOT-ALLOWED))
          (try! (validate-split-percentage new-split))
          (map-set payouts payout-id
            (merge p { instructor-split: new-split })
          )
          (map-set payout-updates payout-id
            {
              update-split: new-split,
              update-timestamp: block-height,
              updater: tx-sender
            }
          )
          (print { event: "payout-updated", id: payout-id })
          (ok true)
        )
      (err ERR-PAYOUT-NOT-FOUND)
    )
  )
)

(define-public (get-payout-count)
  (ok (var-get next-payout-id))
)