(define-constant ERR-NOT-AUTHORIZED u100)
(define-constant ERR-INVALID-CLASS-ID u101)
(define-constant ERR-INVALID-AMOUNT u102)
(define-constant ERR-INVALID-CAPACITY u103)
(define-constant ERR-INVALID-SPLIT u104)
(define-constant ERR-INVALID-INSTRUCTOR u105)
(define-constant ERR-INVALID-VENUE u106)
(define-constant ERR-CLASS-ALREADY-EXISTS u107)
(define-constant ERR-CLASS-NOT-FOUND u108)
(define-constant ERR-INVALID-TIMESTAMP u109)
(define-constant ERR-AUTHORITY-NOT-VERIFIED u110)
(define-constant ERR-INVALID-RECIPIENT u111)
(define-constant ERR-INVALID-STATUS u112)
(define-constant ERR-INVALID-UPDATE-PARAM u113)
(define-constant ERR-MAX-CLASSES-EXCEEDED u114)
(define-constant ERR-INVALID-CURRENCY u115)
(define-constant ERR-INVALID-NAME u116)
(define-constant ERR-UPDATE-NOT-ALLOWED u117)
(define-constant ERR-INVALID-PARTICIPANT u118)
(define-constant ERR-CLASS-NOT-OPEN u119)
(define-constant ERR-ALREADY-REGISTERED u120)

(define-data-var contract-owner principal tx-sender)
(define-data-var next-class-id uint u0)
(define-data-var max-classes uint u1000)
(define-data-var escrow-contract (optional principal) none)

(define-map classes
  uint
  {
    name: (string-utf8 100),
    price: uint,
    capacity: uint,
    instructor-split: uint,
    instructor: principal,
    venue: principal,
    timestamp: uint,
    status: bool,
    currency: (string-utf8 20)
  }
)

(define-map class-registrations
  { class-id: uint, participant: principal }
  bool
)

(define-map class-updates
  uint
  {
    update-name: (string-utf8 100),
    update-price: uint,
    update-timestamp: uint,
    updater: principal
  }
)

(define-read-only (get-class (id uint))
  (map-get? classes id)
)

(define-read-only (get-class-status (id uint))
  (match (map-get? classes id)
    class (ok (get status class))
    (err ERR-CLASS-NOT-FOUND)
  )
)

(define-read-only (get-class-updates (id uint))
  (map-get? class-updates id)
)

(define-read-only (get-class-count)
  (ok (var-get next-class-id))
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

(define-private (validate-capacity (capacity uint))
  (if (> capacity u0)
      (ok true)
      (err ERR-INVALID-CAPACITY))
)

(define-private (validate-split (split uint))
  (if (and (> split u0) (< split u100))
      (ok true)
      (err ERR-INVALID-SPLIT))
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

(define-private (validate-name (name (string-utf8 100)))
  (if (> (len name) u0)
      (ok true)
      (err ERR-INVALID-NAME))
)

(define-private (validate-currency (cur (string-utf8 20)))
  (if (or (is-eq cur u"STX") (is-eq cur u"USD"))
      (ok true)
      (err ERR-INVALID-CURRENCY))
)

(define-private (validate-recipient (p principal))
  (if (not (is-eq p 'SP000000000000000000002Q6VF78))
      (ok true)
      (err ERR-INVALID-RECIPIENT))
)

(define-public (set-escrow-contract (contract-principal principal))
  (begin
    (asserts! (is-eq tx-sender (var-get contract-owner)) (err ERR-NOT-AUTHORIZED))
    (try! (validate-recipient contract-principal))
    (asserts! (is-none (var-get escrow-contract)) (err ERR-AUTHORITY-NOT-VERIFIED))
    (var-set escrow-contract (some contract-principal))
    (ok true)
  )
)

(define-public (create-class (name (string-utf8 100)) (price uint) (capacity uint) (instructor-split uint) (instructor principal) (venue principal) (currency (string-utf8 20)))
  (let (
        (next-id (var-get next-class-id))
        (current-max (var-get max-classes))
      )
    (asserts! (< next-id current-max) (err ERR-MAX-CLASSES-EXCEEDED))
    (try! (validate-name name))
    (try! (validate-amount price))
    (try! (validate-capacity capacity))
    (try! (validate-split instructor-split))
    (try! (validate-instructor instructor))
    (try! (validate-venue venue))
    (try! (validate-currency currency))
    (map-set classes next-id
      {
        name: name,
        price: price,
        capacity: capacity,
        instructor-split: instructor-split,
        instructor: instructor,
        venue: venue,
        timestamp: block-height,
        status: true,
        currency: currency
      }
    )
    (var-set next-class-id (+ next-id u1))
    (print { event: "class-created", id: next-id })
    (ok next-id)
  )
)

(define-public (register-for-class (class-id uint))
  (let (
        (class (map-get? classes class-id))
        (escrow (unwrap! (var-get escrow-contract) (err ERR-AUTHORITY-NOT-VERIFIED)))
      )
    (match class
      c
        (begin
          (asserts! (get status c) (err ERR-CLASS-NOT-OPEN))
          (asserts! (is-none (map-get? class-registrations { class-id: class-id, participant: tx-sender })) (err ERR-ALREADY-REGISTERED))
          (map-set class-registrations { class-id: class-id, participant: tx-sender } true)
          (print { event: "participant-registered", class-id: class-id, participant: tx-sender })
          (ok true)
        )
      (err ERR-CLASS-NOT-FOUND)
    )
  )
)

(define-public (complete-class (class-id uint))
  (let ((class (map-get? classes class-id)))
    (match class
      c
        (begin
          (asserts! (is-eq (get instructor c) tx-sender) (err ERR-NOT-AUTHORIZED))
          (asserts! (get status c) (err ERR-CLASS-NOT-OPEN))
          (map-set classes class-id
            (merge c { status: false })
          )
          (print { event: "class-completed", id: class-id })
          (ok true)
        )
      (err ERR-CLASS-NOT-FOUND)
    )
  )
)

(define-public (update-class (class-id uint) (new-name (string-utf8 100)) (new-price uint))
  (let ((class (map-get? classes class-id)))
    (match class
      c
        (begin
          (asserts! (is-eq (get instructor c) tx-sender) (err ERR-NOT-AUTHORIZED))
          (asserts! (get status c) (err ERR-UPDATE-NOT-ALLOWED))
          (try! (validate-name new-name))
          (try! (validate-amount new-price))
          (map-set classes class-id
            (merge c { name: new-name, price: new-price })
          )
          (map-set class-updates class-id
            {
              update-name: new-name,
              update-price: new-price,
              update-timestamp: block-height,
              updater: tx-sender
            }
          )
          (print { event: "class-updated", id: class-id })
          (ok true)
        )
      (err ERR-CLASS-NOT-FOUND)
    )
  )
)