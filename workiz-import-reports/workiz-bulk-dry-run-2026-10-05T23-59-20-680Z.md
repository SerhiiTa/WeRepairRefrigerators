# Workiz Bulk Import Dry Run

Generated: 2026-10-05T23:59:20.673Z
Mode: DRY_RUN
Zero writes: YES

## Source Counts
- customers: 835
- jobs: 864
- estimates: 962
- invoices: 509
- payments: 908
- financialSnapshots: 712

## Existing In WRA
- customers: 1
- addresses: 1
- jobs: 9
- appointments: 0
- estimates: 10
- invoices: 8
- payments: 9
- financialSnapshots: 9

## Would Create
- customers: 834
- addresses: 1510
- jobs: 811
- appointments: 809
- estimates: 898
- invoices: 474
- payments: 855
- financialSnapshots: 667

## Skipped
- appointments: 11

## Unresolved
- jobs: 44
- estimates: 54
- invoices: 27
- payments: 44
- financialSnapshots: 36
- technicians: 8
- technicianAmbiguities: 0

## Matching
- job high confidence: 803
- job medium confidence: 17
- job unresolved/low confidence: 44
- technician matched: 0
- technician unresolved: 8

## Status Mapping
- Canceled -> canceled: 91
- Done -> completed: 428
- done pending approval -> completed: 218
- In progress -> new: 9
- Pending -> new: 4
- Submitted -> completed: 114

## Financial Summary
- historical invoiced total: $196,792.03
- historical paid amount: $275,140.47
- historical due amount: $13,801.78
- tips: $2,139.95
- payment methods: Bank transfer (ACH), Cash, Check, Credit charge, Refund, Zelle

## Steven Wolf Idempotency
- customer existing: YES
- existing jobs: 9

## Verdict: NOT CUTOVER READY
