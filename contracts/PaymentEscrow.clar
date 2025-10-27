(define-constant ERR-NOT-AUTHORIZED u100)
(define-constant ERR-INVALID-CLASS-ID u101)
(define-constant ERR-INVALID-AMOUNT u102)
(define-constant ERR-CLASS-NOT-FOUND u103)
(define-constant ERR-INSUFFICIENT-BALANCE u104)
(define-constant ERR-ALREADY-ESCROWED u105)
(define-constant ERR-ESCROW-NOT-FOUND u106)
(define-constant ERR-INVALID-TIMESTAMP u107)
(define-constant ERR-AUTHORITY-NOT-VERIFIED u108)
(define-constant ERR-INVALID-RECIPIENT u109)
(define-constant ERR-INVALID-STATUS u110)
(define-constant ERR-TRANSFER-FAILED u111)
(define-constant ERR-INVALID-UPDATE-PARAM u112)
(define-constant ERR-UPDATE-NOT-ALLOWED u113)
(define-constant ERR-MAX-ESCROWS-EXCEEDED u114)
(define-constant ERR-INVALID-CURRENCY u115)
(define-constant ERR-INVALID-PARTICIPANT u116)
(define-constant ERR-ESCROW-ALREADY-RELEASED u117)
(define-constant ERR-INVALID-ESCROW-ID u118)
(define-constant ERR-CLASS-NOT-OPEN u119)
(define-constant ERR-INVALID-REGISTRY u120)

(define-data-var contract-owner principal tx-sender)
(define-data-var next-escrow-id uint u0)
(define-data-var max-escrows uint u10000)
(define-data-var registry-contract (optional principal) none)
(define-data-var payout-contract (optional principal) none)

(define-map escrows
  uint
  {
    class-id: uint,
    participant: principal,
    amount: uint,
    timestamp: uint,
    status: bool,
    currency: (string-utf8 20)
  }
)

(define-map escrows-by-class
  { class-id: uint, participant: principal }
  uint
)

(define-map escrow-updates
  uint
  {
    update-amount: uint,
    update-timestamp: uint,
    updater: principal
  }
)

(define-read-only (get-escrow (id uint))
  (map-get? escrows id)
)

(define-read-only (get-escrow-by-class (class-id uint) (participant principal))
  (map-get? escrows-by-class { class-id: class-id, participant: participant })
)

(define-read-only (get-escrow-updates (id uint))
  (map-get? escrow-updates id)
)

(define-read-only (get-escrow-count)
  (ok (var-get next-escrow-id))
)

(define-private (validate-class-id (id uint))
  (if (> id u0)
      (ok true)
      (err ERR-INVALID-CLASS-ID))
)

(define-private (validate-amount (amount uint))
  (if (> amount u0)
      (ok true)
      (err ERR-INVALID-AMOUNT))
)

(define-private (validate-timestamp (ts uint))
  (if (>= ts block-height)
      (ok true)
      (err ERR-INVALID-TIMESTAMP))
)

(define-private (validate-recipient (p principal))
  (if (not (is-eq p 'SP000000000000000000002Q6VF78))
      (ok true)
      (err ERR-INVALID-RECIPIENT))
)

(define-private (validate-currency (cur (string-utf8 20)))
  (if (or (is-eq cur u"STX") (is-eq cur u"USD"))
      (ok true)
      (err ERR-INVALID-CURRENCY))
)

(define-private (validate-participant (p principal))
  (if (not (is-eq p tx-sender))
      (ok true)
      (err ERR-INVALID-PARTICIPANT))
)

(define-public (set-registry-contract (contract-principal principal))
  (begin
    (asserts! (is-eq tx-sender (var-get contract-owner)) (err ERR-NOT-AUTHORIZED))
    (try! (validate-recipient contract-principal))
    (asserts! (is-none (var-get registry-contract)) (err ERR-AUTHORITY-NOT-VERIFIED))
    (var-set registry-contract (some contract-principal))
    (ok true)
  )
)

(define-public (set-payout-contract (contract-principal principal))
  (begin
    (asserts! (is-eq tx-sender (var-get contract-owner)) (err ERR-NOT-AUTHORIZED))
    (try! (validate-recipient contract-principal))
    (asserts! (is-none (var-get payout-contract)) (err ERR-AUTHORITY-NOT-VERIFIED))
    (var-set payout-contract (some contract-principal))
    (ok true)
  )
)

(define-public (set-max-escrows (new-max uint))
  (begin
    (asserts! (is-eq tx-sender (var-get contract-owner)) (err ERR-NOT-AUTHORIZED))
    (asserts! (> new-max u0) (err ERR-INVALID-UPDATE-PARAM))
    (var-set max-escrows new-max)
    (ok true)
  )
)

(define-public (escrow-payment (class-id uint) (amount uint) (currency (string-utf8 20)))
  (let (
        (next-id (var-get next-escrow-id))
        (current-max (var-get max-escrows))
        (registry (unwrap! (var-get registry-contract) (err ERR-AUTHORITY-NOT-VERIFIED)))
        (class-status (try! (contract-call? registry get-class-status class-id)))
      )
    (asserts! (< next-id current-max) (err ERR-MAX-ESCROWS-EXCEEDED))
    (try! (validate-class-id class-id))
    (try! (validate-amount amount))
    (try! (validate-currency currency))
    (asserts! class-status (err ERR-CLASS-NOT-OPEN))
    (asserts! (is-none (map-get? escrows-by-class { class-id: class-id, participant: tx-sender })) (err ERR-ALREADY-ESCROWED))
    (try! (stx-transfer? amount tx-sender (as-contract tx-sender)))
    (map-set escrows next-id
      {
        class-id: class-id,
        participant: tx-sender,
        amount: amount,
        timestamp: block-height,
        status: true,
        currency: currency
      }
    )
    (map-set escrows-by-class { class-id: class-id, participant: tx-sender } next-id)
    (var-set next-escrow-id (+ next-id u1))
    (print { event: "escrow-created", id: next-id, class-id: class-id })
    (ok next-id)
  )
)

(define-public (release-payment (class-id uint) (amount uint))
  (let (
        (payout (unwrap! (var-get payout-contract) (err ERR-AUTHORITY-NOT-VERIFIED)))
        (registry (unwrap! (var-get registry-contract) (err ERR-AUTHORITY-NOT-VERIFIED)))
        (class-status (try! (contract-call? registry get-class-status class-id)))
      )
    (asserts! (is-eq contract-caller payout) (err ERR-NOT-AUTHORIZED))
    (try! (validate-class-id class-id))
    (try! (validate-amount amount))
    (asserts! class-status (err ERR-CLASS-NOT-OPEN))
    (try! (as-contract (stx-transfer? amount (as-contract tx-sender) payout)))
    (print { event: "escrow-released", class-id: class-id, amount: amount })
    (ok true)
  )
)

(define-public (update-escrow-amount (escrow-id uint) (new-amount uint))
  (let ((escrow (map-get? escrows escrow-id)))
    (match escrow
      e
        (begin
          (asserts! (is-eq (get participant e) tx-sender) (err ERR-NOT-AUTHORIZED))
          (asserts! (get status e) (err ERR-ESCROW-ALREADY-RELEASED))
          (try! (validate-amount new-amount))
          (map-set escrows escrow-id
            (merge e { amount: new-amount })
          )
          (map-set escrow-updates escrow-id
            {
              update-amount: new-amount,
              update-timestamp: block-height,
              updater: tx-sender
            }
          )
          (print { event: "escrow-updated", id: escrow-id })
          (ok true)
        )
      (err ERR-ESCROW-NOT-FOUND)
    )
  )
)