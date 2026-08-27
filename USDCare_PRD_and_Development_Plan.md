# USDCare Product Requirements Document and Development Plan

**Product:** USDCare  
**Category:** Stablecoin-native healthcare payment, escrow, and funding infrastructure  
**Document version:** 1.0  
**Product stage:** MVP definition  
**Prepared:** 16 August 2026  
**Status:** Draft for customer discovery, legal review, and technical design

---

## 1. Executive Summary

USDCare is a financial infrastructure product that connects healthcare invoices and treatment plans to programmable USDC payments.

It enables a verified healthcare provider to request payment, allows a patient or third-party sponsor to pay the provider from anywhere, verifies the payment onchain, reconciles it to the correct invoice, and issues a digital receipt. For eligible treatment plans, it can hold funds in a non-custodial smart-contract escrow and release them as agreed treatment milestones are approved.

The MVP should prove two product loops in sequence:

1. **Healthcare payment:** Request -> Pay -> Verify -> Reconcile -> Settle -> Receipt.
2. **Protected treatment funding:** Create plan -> Fund -> Lock -> Verify milestone -> Release -> Refund/Complete.

USDCare is not an electronic medical record system, hospital management system, insurer, bank, exchange, diagnosis tool, or open crowdfunding marketplace.

### Recommended MVP position

> USDCare helps verified healthcare providers receive and reconcile USDC payments from patients, families, and approved organizations, with optional milestone-based treatment escrow.

### Recommended launch sequence

- Launch one country corridor, one chain, one native USDC contract, and a small set of verified providers.
- Begin with direct invoice payments before enabling production escrow.
- Keep patient and treatment data offchain.
- Use a payment-router contract so each onchain payment contains a deterministic invoice reference.
- Keep the initial design non-custodial: standard payments go directly to provider wallets; escrow funds remain in audited smart contracts.
- Do not launch NGO public fundraising, fiat conversion, pooled balances, or USDC custody in MVP.

---

## 2. Product Thesis

Healthcare funding should be programmable and accountable.

When a person or organization commits money to treatment, it should be possible to determine:

- who funded it;
- which provider and invoice it was intended for;
- how much was committed;
- whether the payment settled;
- how much is locked, released, refunded, or remaining;
- which approved milestone authorized a release; and
- whether the financial lifecycle is complete.

Healthcare systems continue to manage diagnosis, care delivery, clinical notes, and medical records. USDCare manages the related financial lifecycle.

```text
Healthcare: Patient -> Diagnosis -> Treatment -> Clinical Record
USDCare:    Funding -> Payment/Escrow -> Verification -> Release -> Reconciliation
```

The product becomes valuable where a healthcare event authorizes a financial event without exposing healthcare records onchain.

---

## 3. Problem Statement

### Patients

- Treatment may require immediate or large upfront payment.
- Payment confirmation can delay care.
- Patients frequently depend on relatives, employers, charities, or other sponsors.
- A patient may need to coordinate multiple payers or partial payments.

### Families and diaspora sponsors

- Cross-border transfers can be slow, expensive, or difficult to route directly to a provider.
- A sponsor has limited assurance that money sent to an individual paid the intended bill.
- Traditional transfers do not show treatment-linked release or refund history.

### Healthcare providers

- Payment confirmation and reconciliation are often manual.
- Bank transfers, cash, POS, and payment processors create fragmented records.
- Partial payments and long-running treatment plans are difficult to track.
- Providers lack a purpose-built way to receive protected, milestone-based funding.

### NGOs and healthcare funders

- Restricted funding is difficult to enforce after a transfer.
- Program teams need allocation, release, refund, and balance reporting.
- Donor reporting must provide financial transparency without revealing patient health information.

---

## 4. Goals and Non-Goals

### 4.1 MVP goals

- Onboard and verify healthcare provider organizations.
- Let providers create USDC invoices and payment links.
- Let a payer create or access a USDCare account with email verification and receive an embedded wallet automatically.
- Reliably associate an onchain payment with one invoice.
- Independently verify the chain, token, amount, recipient, success, and confirmation status.
- Maintain an immutable application audit trail and double-entry financial ledger.
- Generate verifiable digital receipts.
- Support treatment escrow with predefined milestone amounts.
- Support milestone approval, release, cancellation, and refunds.
- Give providers, payers, and authorized funders role-appropriate visibility.
- Protect sensitive personal and healthcare data.
- Establish a legally reviewed operating model for the launch jurisdiction.

### 4.2 Non-goals for MVP

- Electronic medical records or detailed clinical records.
- Medical diagnosis or clinical decision support.
- Full hospital or pharmacy management.
- Insurance underwriting or claims adjudication.
- Consumer lending, treatment financing, or interest-bearing balances.
- Fiat deposits, fiat withdrawals, or foreign-exchange services operated by USDCare.
- USDCare-operated custody, custom private-key generation, or direct access to user private keys. Privy provides email authentication, embedded wallets, external wallet connectors, recovery, and the selected custody controls.
- Open public crowdfunding or anonymous donations.
- Multi-chain support.
- Transferable treatment entitlements or tokenized medical claims.
- A decentralized dispute court.
- Fully autonomous milestone verification.

---

## 5. MVP Market and Operating Assumptions

The first production pilot should be deliberately narrow.

### Recommended pilot

- **Providers:** 3-5 verified private clinics, diagnostic centres, dialysis centres, or hospitals.
- **Payers:** patients and invited family/sponsors who can sign in with email and fund their automatically created USDCare wallet. Existing external wallets may be used as a funding source.
- **Funders:** one or two contractually onboarded NGOs or employers, not public donors.
- **Treatments:** fixed-price diagnostics and repeatable treatment sessions with clear milestones.
- **Geography:** one legally approved provider jurisdiction and a limited set of payer jurisdictions.
- **Settlement asset:** Circle-issued native USDC only.
- **Network:** Arc Testnet (`eip155:5042002`) is the MVP development and contract deployment network. RPC, explorer, and USDC configuration remain environment-driven and must be verified against official Arc documentation before production use.
- **Custody:** non-custodial wherever possible.
- **Account model:** email-first authentication with an embedded wallet created or recovered after the email is verified.

### Why this wedge

Diagnostics and repeatable treatments have understandable prices, clear completion events, and lower workflow ambiguity than emergency care or complex surgery. They are better for proving payment, reconciliation, milestone release, and refund behavior.

---

## 6. Users and Jobs to Be Done

### Provider administrator

**Job:** Configure the organization, verify its identity, manage settlement wallets, staff, roles, and policies.

### Provider finance staff

**Job:** Create payment requests, confirm settlements, reconcile transactions, issue receipts, and export reports.

### Provider treatment staff

**Job:** View assigned treatment plans and submit evidence that a milestone is complete, without receiving financial administration permissions.

### Patient

**Job:** View what is due, share a payment link, see whether treatment is funded, approve a milestone where required, and access receipts.

### Payer or family sponsor

**Job:** Pay a specific healthcare invoice directly, track the financial status, and see releases or refunds related to the funded plan.

### NGO program manager

**Job:** Fund approved treatment plans, allocate program funds, approve releases when required, and generate program reports.

### USDCare compliance and operations staff

**Job:** Review providers, investigate exceptions, monitor risk, manage disputes under policy, and inspect audit trails without having unilateral authority to seize or redirect funds.

---

## 7. Product Principles

1. **Care should not wait on an unreliable payment status.** Pending and confirmed states must be unambiguous.
2. **The backend never trusts the frontend's claim that payment succeeded.** Chain verification is authoritative for settlement.
3. **No sensitive medical data onchain.** Onchain identifiers must be random or hashed and must not be reversible patient identifiers.
4. **Blockchain settlement is not the accounting ledger.** USDCare maintains an internal double-entry ledger and reconciles it with onchain events.
5. **Every financial mutation is idempotent and auditable.** Retries cannot cause duplicate releases, receipts, or ledger postings.
6. **Least privilege applies to people, services, and contracts.** Treatment staff should not inherit finance permissions.
7. **No silent automation for high-risk releases.** High-value or disputed releases require policy-based approval.
8. **Start narrow.** One chain, one stablecoin, one jurisdictional model, and a small provider cohort.
9. **Design for failure.** RPC outages, chain reorganizations, duplicate events, wallet rejection, underpayment, and delayed confirmations are normal states.
10. **Privacy is a data-minimization problem.** USDCare should store only the treatment and identity data required for its financial purpose.

---

## 8. Scope and Release Priorities

Priority labels:

- **P0:** required to launch the applicable phase.
- **P1:** important after the core path is reliable.
- **P2:** later enhancement.

### 8.1 Provider and organization management

| ID | Requirement | Priority |
|---|---|---|
| ORG-01 | Register a provider organization and primary administrator | P0 |
| ORG-02 | Submit provider legal identity, licence, address, and beneficial-owner/controller information for review | P0 |
| ORG-03 | Approve, reject, suspend, and re-review providers | P0 |
| ORG-04 | Add staff and assign predefined RBAC roles | P0 |
| ORG-05 | Register a settlement wallet and verify control using a signed challenge | P0 |
| ORG-06 | Require step-up authentication and a cooling-off workflow when changing settlement wallets | P0 |
| ORG-07 | Support multiple provider locations/departments | P1 |
| ORG-08 | Configure invoice expiry, confirmation policy, and escrow approval policy within platform limits | P1 |

#### Account creation and wallet setup

Account creation must clearly establish whether the email belongs to a person acting individually or to someone creating an organization workspace.

```text
Verify email
     |
     v
Who is this account for?
     |
     +--> Individual
     |       |
     |       +--> Built-in wallet created automatically
     |       +--> Optional: connect an existing outside wallet
     |       +--> Choose the default transaction wallet
     |
     +--> Organization
             |
             +--> Create organization profile
             +--> Built-in wallet created automatically
             +--> Optional: connect an existing outside wallet
             +--> Choose the transaction/approval wallet
             +--> Does the organization already have a settlement wallet?
                       |
                       +--> Yes: connect and verify it separately
                       |
                       +--> No: designate the built-in or connected wallet
                                 as the organization settlement wallet
```

Requirements:

- Ask `Who is this account for?` immediately after email verification, with `An individual` and `An organization` as the choices.
- Explain that an organization account is for a hospital, clinic, diagnostic centre, pharmacy, NGO, employer, insurer, or other legal entity.
- Treat the verified email as the identity of a human user. Selecting `An organization` creates an organization workspace and makes that user its initial administrator; it does not make the email itself a legal entity.
- Allow the same verified user to keep an individual profile and later join or administer multiple organization workspaces. The initial choice determines the first onboarding path, not a permanent account limitation.
- An organization email domain is supporting information, not proof that the organization is legitimate or that the user is authorized to represent it.
- Create the email user's embedded wallet automatically regardless of account type.
- Offer `Connect an existing wallet` during setup. Connecting requires a wallet signature that proves control.
- Never ask the user to paste a seed phrase or private key. External wallets are connected through Privy's external wallet connector. Private-key import is not part of the USDCare MVP, even though Privy offers wallet-import products for other use cases.
- Let the user select the embedded wallet or a connected outside wallet as their default **transaction wallet**.
- For an organization, ask `Does your organization already have a separate wallet for receiving payments?`
- When the answer is yes, verify control of that wallet separately and make it the **organization settlement wallet**. Provider revenue and applicable refunds settle there.
- When the answer is no, allow the authorized administrator to designate the embedded wallet or a connected outside wallet as the organization settlement wallet after a clear security warning and confirmation.
- Prefer a Privy organization/treasury wallet with organization policies and approvals rather than reusing an administrator's personal embedded wallet. If the same personal wallet is used, explain that account recovery or compromise can affect organization funds.
- Keep transaction and settlement roles visible in settings. One wallet may perform both roles, but the UI must never hide that choice.
- Changing either role after activation requires MFA, a signed wallet challenge, dual approval where available, a cooling-off period, and notifications.
- Organization verification and wallet verification are separate. Proving control of a wallet does not verify the organization, and verifying an organization does not prove wallet control.

Onboarding language must explain:

> Your transaction wallet is the wallet you use to approve payments and actions. Your settlement wallet is the wallet where your organization receives provider payments. They can be the same wallet, but using a separate settlement wallet is safer for an organization.

### 8.2 Invoices and payment requests

| ID | Requirement | Priority |
|---|---|---|
| INV-01 | Create an invoice with provider, patient reference, service summary, amount, expiry, and payment type | P0 |
| INV-02 | Generate a non-guessable public payment URL and QR code | P0 |
| INV-03 | Display provider identity, service summary, amount, network, USDC token, expiry, and status | P0 |
| INV-04 | Cancel an unpaid invoice | P0 |
| INV-05 | Prevent edits to financially material fields after payment begins; changes create a replacement invoice | P0 |
| INV-06 | Support partial payment only when explicitly enabled | P1 |
| INV-07 | Support invoice reminders | P1 |
| INV-08 | Export invoice and payment data | P1 |

### 8.3 Payer experience

| ID | Requirement | Priority |
|---|---|---|
| PAY-01 | Preview the provider, service summary, amount, token, network, and expiry before authentication | P0 |
| PAY-02 | Create or access an account using a verified email and one-time code | P0 |
| PAY-03 | Detect and block the wrong network | P0 |
| PAY-04 | Show the exact native USDC token and prohibit lookalike/bridged tokens | P0 |
| PAY-05 | Show approval, submission, detection, confirmation, and final receipt states | P0 |
| PAY-06 | Resume the same wallet, invoice, and payment status after secure sign-in on another device | P0 |
| PAY-07 | Provide a transaction explorer link | P0 |
| PAY-08 | Automatically provision or recover an embedded wallet after email verification | P0 |
| PAY-09 | Show wallet USDC balance and a copyable receive address with the correct network | P0 |
| PAY-10 | Deliver receipts and security notifications to the verified account email | P0 |
| PAY-11 | Sponsor or relay gas only for allowlisted USDCare payment and escrow actions | P0 |
| PAY-12 | Let a user transfer USDC into the embedded wallet from an external wallet or exchange | P0 |
| PAY-13 | Add passkey sign-in and transaction confirmation as a stronger authentication option | P1 |
| PAY-14 | Allow payment from a connected outside wallet while retaining the email-based USDCare account | P0 |

#### Embedded wallet account rules

- Every human user account is identified by a verified email address.
- The first successful email verification creates a user record and provisions an embedded wallet, or recovers the existing wallet for that user.
- A single user must not receive a new wallet merely because they change devices, clear browser storage, or reopen a shared payment link.
- Email aliases, changed email addresses, duplicate identities, and account merging require explicit policy and auditable support workflows.
- USDCare must never log, transmit, or store a raw private key or recovery secret.
- Wallet creation, signing, recovery, export, and delegated permissions use Privy's documented wallet and custody model. USDCare does not implement an additional key system.
- A user's embedded wallet is personal by default. An authorized organization administrator may explicitly designate an embedded or connected wallet as the organization settlement wallet when no separate wallet exists.
- Provider staff may use their embedded or connected transaction wallet for approvals and funding actions. Customer funds settle to the verified organization settlement wallet, which may be the same wallet only when the organization deliberately selected and verified it during onboarding.
- The embedded wallet must initially support only the selected MVP network in the product UI, even if the wallet infrastructure technically supports other chains.
- The wallet UI shows spendable USDC, pending USDC, and the network gas experience. It must not present unrelated token balances or speculative portfolio information.
- The MVP does not operate a fiat on-ramp. Users fund the wallet by receiving native USDC from an external wallet or compatible exchange; regulated on-ramp integration is a later workstream.

### 8.4 Payment verification and reconciliation

| ID | Requirement | Priority |
|---|---|---|
| REC-01 | Verify supported chain ID and the allowlisted native USDC contract | P0 |
| REC-02 | Verify transaction success, payer, recipient, amount, invoice ID, and payment-router event | P0 |
| REC-03 | Apply a documented confirmation/finality policy | P0 |
| REC-04 | Process duplicate webhooks/events idempotently | P0 |
| REC-05 | Detect underpayment, overpayment, duplicate payment, late payment, and wrong-token attempts | P0 |
| REC-06 | Reconcile application ledger entries to onchain events continuously | P0 |
| REC-07 | Route exceptions to an operations queue | P0 |
| REC-08 | Rebuild state from an indexed block range without duplicate accounting | P0 |
| REC-09 | Support a secondary RPC/indexing provider and backfill after outages | P1 |

### 8.5 Receipts

| ID | Requirement | Priority |
|---|---|---|
| RCP-01 | Generate a receipt only after the configured confirmation threshold | P0 |
| RCP-02 | Include provider, service summary, amount, invoice ID, network, token, timestamp, and transaction hash | P0 |
| RCP-03 | Provide a tamper-evident receipt verification page | P0 |
| RCP-04 | Make receipts printable and downloadable as PDF | P1 |
| RCP-05 | Notify provider and payer when a receipt is issued | P1 |

### 8.6 Escrow and milestones

| ID | Requirement | Priority |
|---|---|---|
| ESC-01 | Create a treatment escrow with payer, provider, token, total, expiry, approval policy, and milestones | P0 for escrow release |
| ESC-02 | Require milestone amounts to sum exactly to the escrow principal | P0 |
| ESC-03 | Fund escrow with native USDC | P0 |
| ESC-04 | Submit milestone completion with an offchain evidence reference | P0 |
| ESC-05 | Approve a milestone under one of the allowlisted approval policies | P0 |
| ESC-06 | Release exactly the predefined amount once | P0 |
| ESC-07 | Cancel an eligible escrow and refund the unreleased balance | P0 |
| ESC-08 | Prevent release and refund from spending the same balance | P0 |
| ESC-09 | Pause new actions during a dispute while leaving released funds unchanged | P0 |
| ESC-10 | Show funded, locked, released, refundable, and refunded totals | P0 |
| ESC-11 | Support expiry and timeout rules | P1 |
| ESC-12 | Support multi-party threshold approval | P1 |

### 8.7 NGO/funder programs

| ID | Requirement | Priority |
|---|---|---|
| NGO-01 | Create a private funding program with budget and approved providers | P1 after escrow |
| NGO-02 | Allocate budget to a patient/treatment reference | P1 |
| NGO-03 | Fund individual treatment escrows from an approved program wallet | P1 |
| NGO-04 | Track funded, allocated, locked, released, refunded, and available values | P1 |
| NGO-05 | Export donor/auditor reports without sensitive patient data | P1 |
| NGO-06 | Public donations and open campaigns | P2, separate legal/product review |

### 8.8 Administration, risk, and support

| ID | Requirement | Priority |
|---|---|---|
| ADM-01 | Provider review and status management | P0 |
| ADM-02 | Payment and reconciliation exception queue | P0 |
| ADM-03 | Append-only audit event viewer | P0 |
| ADM-04 | Risk flags and manual review notes | P0 |
| ADM-05 | Dispute case management | P0 for escrow |
| ADM-06 | Emergency pause capability with separated authorization | P0 for escrow |
| ADM-07 | Support impersonation only through explicit, logged, time-limited access | P1 |

---

## 9. Core User Flows

### 9.1 Standard invoice payment

1. Provider finance user creates an invoice.
2. Backend validates provider status and settlement wallet.
3. USDCare creates an immutable invoice version and random onchain invoice reference.
4. System generates a payment link and QR code.
5. Patient shares the link with a payer, or pays directly.
6. Payer reviews the invoice, signs in with email, and verifies a one-time code.
7. Privy creates or recovers the payer's embedded wallet and loads any external wallets connected through Privy.
8. Payer chooses the embedded wallet or a connected wallet as the transaction wallet.
9. If the selected wallet lacks USDC, the payer receives its network-specific address and funds it from an outside wallet or exchange.
10. Selected wallet authorizes native USDC and calls the Payment Router. USDCare sponsors or relays only the allowlisted payment action where the approved wallet architecture permits it.
11. Payment Router transfers USDC directly from the payer's transaction wallet to the provider's verified organization settlement wallet and emits an event containing the invoice reference.
12. Indexer detects the event.
13. Verification service checks chain, token, amount, payer wallet, settlement recipient, invoice, transaction success, and confirmations.
14. Ledger service posts balanced entries.
15. Invoice becomes paid and a receipt is issued to the account.
16. Provider and payer receive notifications.

### 9.2 Milestone escrow

1. Provider creates a treatment plan and milestone schedule.
2. Authorized payer/funder reviews the total, release policy, refund policy, and expiry.
3. Escrow contract is created or initialized with a random reference and financial terms.
4. Payer funds the escrow in native USDC.
5. Provider submits milestone completion.
6. Required parties approve according to policy.
7. Contract releases the predefined amount to the provider.
8. Backend indexes the event, updates the ledger, and notifies authorized parties.
9. Final milestone completes the escrow; unused funds are refunded under the agreed rule.

### 9.3 Exception flow

- Underpayment remains unresolved until topped up, expired, or manually closed under policy.
- Overpayment is never silently treated as platform revenue; it creates a refund/review obligation.
- Wrong-token transfers are not marked paid and may be unrecoverable. The interface must warn users before signing.
- A transaction sent after invoice expiry enters review unless the invoice explicitly allows late settlement.
- A duplicate payment creates a separate payment record and refund/reallocation case.
- Chain or RPC uncertainty must display `CONFIRMATION_DELAYED`, not `FAILED`, until determinable.

---

## 10. State Machines

### 10.1 Invoice

```text
DRAFT -> ISSUED -> AWAITING_PAYMENT -> PAYMENT_DETECTED -> CONFIRMING -> PAID -> RECEIPT_ISSUED
           |               |                  |             |
           v               v                  v             v
        CANCELLED        EXPIRED      VERIFICATION_FAILED  REFUND_PENDING -> REFUNDED
```

Only the payment orchestration service may transition financial invoice states. Manual operators request an action; they do not directly overwrite status fields.

### 10.2 Payment

```text
CREATED
  -> WALLET_ACTION_REQUIRED
  -> SUBMITTED
  -> DETECTED
  -> VERIFYING
  -> CONFIRMING
  -> CONFIRMED
  -> RECONCILED

Terminal/exception states:
REJECTED | REVERTED | WRONG_NETWORK | WRONG_TOKEN | UNDERPAID |
OVERPAID | DUPLICATE | EXPIRED | MANUAL_REVIEW
```

### 10.3 Escrow

```text
DRAFT -> CREATED -> AWAITING_FUNDING -> FUNDED -> ACTIVE
                                                  |
                                                  v
                                          PARTIALLY_RELEASED
                                            |           |
                                            v           v
                                        COMPLETED    DISPUTED

Alternative terminal path:
AWAITING_FUNDING/FUNDED/ACTIVE/DISPUTED -> CANCELLING -> REFUNDING -> REFUNDED
```

### 10.4 Milestone

```text
PENDING -> SUBMITTED -> AWAITING_APPROVAL -> APPROVED -> RELEASE_SUBMITTED -> RELEASED
              |                 |
              v                 v
          NEEDS_CHANGES      REJECTED
```

---

## 11. Financial Model and Internal Ledger

USDCare must use an append-only, double-entry ledger. Database balance columns may be cached views, never the source of truth.

### Ledger accounts may include

- provider receivable;
- provider settlement;
- payer payment in flight;
- escrow locked principal;
- escrow released principal;
- refund payable;
- network fee expense, if USDCare sponsors gas;
- platform fee receivable, only if legally and contractually enabled;
- reconciliation suspense.

### Core accounting invariant

For each currency and transaction batch:

```text
sum(debits) = sum(credits)
```

For every escrow:

```text
funded = locked + released + refunded + release_pending + refund_pending
```

No code path may reduce locked funds without creating a corresponding release, refund, or pending ledger movement.

### Reconciliation layers

1. **Transaction reconciliation:** an onchain event matches an internal payment/release/refund.
2. **Balance reconciliation:** contract and provider settlement movements match the ledger.
3. **Invoice reconciliation:** confirmed payment allocations equal the invoice's paid amount.
4. **Escrow reconciliation:** contract state equals the application projection.

---

## 12. Onchain Design

### 12.1 Payment Router

The router solves the missing-memo problem in ordinary ERC-20 transfers.

Conceptual function:

```solidity
payInvoice(
    bytes32 invoiceRef,
    address provider,
    uint256 amount
)
```

Required behavior:

- accept only the allowlisted native USDC contract;
- transfer funds directly from payer to provider;
- emit `InvoicePaid(invoiceRef, payer, provider, amount)`;
- reject reused invoice/payment authorizations where appropriate;
- never store medical or directly identifying patient data;
- have no general-purpose withdrawal function because it should not retain funds.

The embedded-wallet flow should avoid requiring the payer to acquire the chain's native gas token. The implementation must evaluate an allowlisted gas-sponsorship, account-abstraction, or signed authorization/relay flow so USDC is the only balance the payer needs for supported actions. Sponsorship must be scoped to exact USDCare contracts, methods, token amounts, rate limits, and risk controls. Connected outside wallets may use their own gas when sponsorship is unavailable.

### 12.2 Escrow contract

The escrow contract should contain only financial terms and pseudonymous references.

Conceptual functions:

```solidity
createEscrow(...)
fundEscrow(bytes32 escrowRef, uint256 amount)
submitMilestone(bytes32 escrowRef, uint32 milestoneId, bytes32 evidenceHash)
approveMilestone(bytes32 escrowRef, uint32 milestoneId)
releaseMilestone(bytes32 escrowRef, uint32 milestoneId)
openDispute(bytes32 escrowRef, bytes32 reasonHash)
cancelEscrow(bytes32 escrowRef)
refund(bytes32 escrowRef)
```

### Contract requirements

- `SafeERC20` handling.
- Reentrancy protection where external calls occur.
- Explicit roles and separated emergency powers.
- Checks-effects-interactions ordering.
- One-time milestone release.
- Fixed milestone amounts after funding.
- Funding, release, refund, dispute, pause, and completion events.
- No arbitrary token support in MVP.
- No arbitrary recipient replacement after funding.
- A documented upgrade strategy. Prefer immutable contracts for the pilot if practical; if upgradeable, use timelocks, multisig control, change review, and clear user disclosure.
- Emergency pause must stop new funding/releases while preserving user exit/refund options defined by policy.

### Approval policies

- `PROVIDER_ONLY`: restricted to low-value pilots where contract and legal terms permit.
- `PROVIDER_AND_PATIENT`: recommended default for sponsor-funded treatment.
- `PROVIDER_AND_FUNDER`: recommended for NGO programs.
- `PROVIDER_AND_PATIENT_AND_FUNDER`: high-friction, higher-control option.

Approval policies must be fixed when an escrow is funded unless all affected parties sign an amendment.

---

## 13. System Architecture

USDCare should be a modular monolith for the MVP, with asynchronous workers for blockchain indexing and notifications. Do not begin with a large microservice estate.

```text
Provider Web App     Public Payer App     Operations/Admin App
         \                 |                    /
                    API / BFF
                         |
  -----------------------------------------------------------
  | Auth | Organizations | Invoices | Payments | Escrow | NGO |
  | Ledger | Reconciliation | Risk | Receipts | Audit | Files |
  -----------------------------------------------------------
             |                 |                |
         PostgreSQL        Job Queue       Object Storage
             |                 |                |
             +---------- Event/Outbox ---------+
                               |
                 Blockchain Indexer/Verifier
                    |                    |
                RPC Provider       Secondary RPC
                    |
          Payment Router + Escrow Contracts
                    |
                Native USDC
```

Privy sits alongside the web applications and API as the managed identity and wallet layer:

```text
Web applications
     |
     +--> Privy React SDK: email OTP, session, embedded wallet, external wallets
     |
     +--> USDCare API: organizations, RBAC, compliance, invoices, ledger, escrow
                              |
                              +--> Privy server verification/webhooks
                              +--> Blockchain verification/indexing
```

### Twelve architectural capabilities

1. Provider experience.
2. Patient/payer experience.
3. Provider and organization management.
4. Core healthcare payment backend.
5. Payment orchestration and state machines.
6. Blockchain and USDC integration.
7. Smart-contract escrow.
8. Internal ledger and reconciliation.
9. Identity, access, and security.
10. Privacy and healthcare-data separation.
11. Notifications and communications.
12. Infrastructure, observability, and operations.

Compliance, risk, auditability, and data governance cut across all twelve.

### Suggested stack

- **Web:** Next.js/React with TypeScript.
- **Authentication and wallets:** Privy React SDK for email OTP, session state, embedded wallets, external wallet connections, and supported wallet UI; Privy server SDK/token verification on the backend.
- **API:** TypeScript with NestJS/Fastify, or another strongly structured backend framework the team already operates well.
- **Database:** PostgreSQL.
- **Queue/workflows:** durable job queue initially; evaluate Temporal when workflow complexity justifies it.
- **Contracts:** Solidity, Foundry, and OpenZeppelin libraries.
- **EVM client:** viem/wagmi.
- **Indexing:** application-owned event indexer with stored block cursor and idempotent handlers; optionally complement with a managed indexing provider.
- **Cache/rate limits:** Redis.
- **Files:** encrypted object storage with short-lived signed access.
- **Observability:** structured logs, metrics, distributed traces, error tracking, and alerting.
- **Infrastructure:** infrastructure as code, isolated environments, managed secrets/KMS, automated backups.

---

## 14. Data Model

Core entities:

```text
User
UserEmailIdentity
AccountProfile
Organization
OrganizationVerification
Membership
RoleAssignment
Wallet
WalletVerification
WalletConnection
WalletRoleAssignment
PrivyUserAccount
PrivyWalletReference
PatientReference
Invoice
InvoiceVersion
PaymentRequest
Payment
BlockchainTransaction
PaymentAllocation
Receipt
TreatmentPlan
Escrow
EscrowParty
Milestone
MilestoneSubmission
Approval
Release
Refund
Dispute
FundingProgram
FundingAllocation
LedgerAccount
LedgerTransaction
LedgerEntry
ReconciliationRun
ReconciliationException
Notification
AuditEvent
RiskCase
```

### Data rules

- Use UUID/ULID-style internal IDs and separate random public references.
- Never encode patient names, diagnoses, phone numbers, or record numbers in onchain IDs.
- Encrypt sensitive fields at rest and use field-level encryption for high-risk identifiers.
- Separate identity/contact data from treatment/payment data where practical.
- Treat blockchain wallet addresses as personal data when linked to an identifiable person.
- Store consent/legal-basis records and retention metadata.
- Use soft deletion only where legal retention requires it; support irreversible anonymization where deletion is valid.

---

## 15. Identity, Access, and Wallet Security

### Authentication

- Email is the primary account identifier for all human users.
- Sign-in uses a time-limited one-time code or secure email link with anti-enumeration, rate limiting, and replay protection.
- First sign-in requires the user to choose an individual or organization account context.
- The email identity may have an individual profile plus memberships in multiple organization workspaces; authorization always uses the currently selected workspace.
- Privy provisions or recovers the embedded wallet only after Privy email authentication succeeds.
- Email verification alone must not authorize high-value financial actions.
- Privy MFA is mandatory for provider finance, provider admins, NGO managers, and USDCare operators where the selected Privy wallet/auth configuration supports the required factor and transaction policy.
- Passkeys should be added as the preferred step-up and recovery factor after initial email onboarding.
- Support secure account recovery with cooling-off and alerting.
- High-risk actions require recent authentication.
- Sessions are revocable and visible to the user.

### Embedded and connected wallets

- Privy is the required MVP provider for email login, user authentication, embedded wallet creation/recovery, external wallet connection, and supported smart-wallet/gas-management features.
- USDCare stores the Privy user ID, Privy wallet ID/reference, public address, chain type, wallet type, verification state, and application role. It never stores raw signing secrets.
- The account settings page lists every embedded and connected wallet, its network, verification status, last use, and assigned role.
- External wallets are connected through Privy's external wallet connector and then verified for a USDCare role with a signed challenge containing the USDCare domain, user/account ID, chain, nonce, issued time, and expiry.
- Disconnecting a wallet removes it as an available transaction wallet but does not alter historical transactions.
- A wallet assigned as an active organization settlement wallet cannot be disconnected until a replacement passes the full change workflow.
- The user can choose a default transaction wallet and override it before each payment when policy permits.
- Privy embedded wallet recovery must preserve the same wallet reference/address unless Privy's documented recovery or migration process requires a change; migrations create a high-risk audit event.

### Privy integration architecture

Privy is infrastructure, not USDCare's application database. USDCare remains authoritative for organizations, roles, compliance status, invoices, treatment plans, wallet-role assignments, and financial records.

```text
User
  |
  v
Privy email OTP authentication
  |
  +--> Privy user ID
  +--> Privy embedded wallet
  +--> Privy-connected external wallets
  |
  v
USDCare backend validates Privy access token
  |
  +--> Internal user/profile
  +--> Individual and organization workspaces
  +--> Transaction and settlement wallet roles
  +--> RBAC, compliance, invoices, ledger, escrow
```

Frontend requirements:

- Use Privy's official React/Next.js SDK and place `PrivyProvider` near the application root.
- Enable email as the MVP login method in the Privy Dashboard.
- Configure Ethereum embedded wallets with Privy's automatic `createOnLogin` behavior for users without wallets.
- Use Privy's email OTP APIs/components for send-code, verify-code, loading, and error states.
- Wait for Privy's authentication `ready` state before consuming user data.
- Wait for Privy's wallet `ready` state before selecting or displaying wallets.
- Use Privy's external-wallet connection APIs for supported EVM wallets.
- Use Privy's balance/funding components or APIs where they fit the approved USDCare interface; wrap them in USDCare terminology and privacy rules.
- Do not create a separate USDCare wallet, generate a seed phrase, or silently replace the Privy wallet.

Backend requirements:

- Validate Privy access tokens on every authenticated API request using Privy's supported server verification flow.
- Key the identity mapping by immutable Privy user ID, not email alone. Email can change; financial history and organization membership must remain attached to the internal user.
- Store Privy app ID and public client configuration separately by environment.
- Store Privy app secrets and authorization credentials only in managed server-side secret storage.
- Treat Privy webhooks as untrusted input until signature/authenticity checks, schema validation, replay protection, and idempotency checks pass.
- Reconcile Privy wallet and transaction webhooks with direct blockchain verification. A Privy event accelerates status updates but does not replace onchain verification for settlement.
- Record Privy request/event IDs in audit metadata for support and incident investigation.

Wallet model:

- **Personal embedded wallet:** created by Privy for an authenticated user and used for user-authorized payments and approvals.
- **External wallet:** connected through Privy and optionally selected as a transaction or settlement wallet after USDCare verification.
- **Organization settlement wallet:** either a verified external wallet, a deliberately designated personal embedded wallet, or preferably a Privy organization/treasury wallet with appropriate controls.
- **Smart wallet:** a Privy-supported smart-account layer may be used for gas sponsorship. When used, the UI must clearly identify the address that actually holds assets and receives deposits.

Privy smart-wallet gas sponsorship is the preferred embedded-wallet path for MVP evaluation. The embedded wallet acts as the user-controlled signer and the smart wallet is the transaction account. USDCare must not display the signer address as the deposit address when assets belong to the smart wallet.

Vendor controls:

- Complete security, privacy, data-processing, regional availability, incident-response, recovery, export, and business-continuity review before production.
- Define behavior for Privy API outage, webhook delay, SDK initialization failure, user export, account deletion, wallet recovery, and vendor migration.
- Keep USDCare financial records and onchain references portable so a Privy service disruption does not erase invoice, ledger, receipt, or escrow history.

### Authorization

Use organization-scoped RBAC with resource ownership checks. Minimum roles:

- provider administrator;
- provider finance;
- provider treatment staff;
- provider viewer/auditor;
- NGO program manager;
- NGO finance;
- USDCare verification analyst;
- USDCare support;
- USDCare risk/compliance;
- USDCare security administrator.

### High-risk controls

- Settlement-wallet changes require signed proof of control, MFA, dual approval, delay, and notifications.
- Assigning a personal embedded wallet as an organization settlement wallet requires explicit acknowledgement of recovery, access, and treasury risk.
- Contract administration uses multisig, separated signers, hardware wallets, and transaction simulation.
- No customer-support role can release, refund, or redirect funds.
- All financial commands carry idempotency keys and actor/device context.

---

## 16. Privacy and Healthcare Data

### Onchain

- random invoice and escrow references;
- wallet addresses;
- token and amount;
- timestamps/block data;
- contract state and events;
- hashes of evidence packages only when necessary.

### Offchain

- patient identity and contact details;
- provider records;
- service descriptions;
- treatment plan details;
- milestone evidence;
- licences and verification documents;
- dispute documents;
- notification data.

### Privacy requirements

- Complete a data protection impact assessment before production.
- Define controller/processor roles with each provider and vendor.
- Establish retention schedules by data category.
- Restrict staff access based on role and patient/program relationship.
- Log every access to sensitive evidence or identity data.
- Use region-appropriate storage and assess cross-border data transfers.
- Use generic service descriptions on public payment pages where disclosure could reveal a diagnosis.
- Do not include diagnosis or confidential treatment information in emails, SMS, URLs, analytics, logs, or blockchain data.

---

## 17. Compliance and Legal Workstream

This PRD is not legal advice. The product must not launch money movement or escrow until qualified counsel approves the exact jurisdiction, entity, contracts, custody model, fund flow, and vendor arrangement.

### Required legal questions

1. Does operating the Payment Router or Escrow contract make USDCare a virtual-asset service provider, money transmitter, payment service provider, escrow agent, or equivalent?
2. Does USDCare ever control private keys, unilaterally move funds, intermediate settlement, or pool customer assets?
3. Which parties require KYC/KYB, sanctions screening, transaction monitoring, or travel-rule controls?
4. Can treatment escrow be offered by software contract alone, or must a licensed partner act as escrow/payment intermediary?
5. What patient-consent and health-data rules apply to the selected provider jurisdiction?
6. Which consumer-protection, disclosure, complaints, refund, abandonment, and insolvency rules apply?
7. How may providers convert USDC to local currency, and which licensed partner provides that service?
8. Are NGO donations, restricted grants, and cross-border charitable flows subject to additional approvals or reporting?
9. How are taxes, invoices, exchange-rate disclosures, and provider accounting handled?
10. What legal agreement governs milestone acceptance and dispute resolution?

### Compliance-by-design requirements

- Provider KYB and licence verification before activation.
- Risk-based payer/funder identity checks based on jurisdiction, amount, pattern, and product type.
- Sanctions and prohibited-address screening at applicable points.
- Transaction monitoring for structuring, rapid pass-through, unusual geography, stolen-funds indicators, and provider anomalies.
- Configurable limits by provider, payer, program, transaction, and day.
- Case management and suspicious-activity escalation procedures.
- Terms that clearly explain irreversibility, gas, finality, refunds, dispute policy, token/network risk, and who is legally responsible for care.
- No use of the words bank, deposit, savings, insurance, guaranteed, or protected unless legally accurate.

---

## 18. Security Requirements

### Application

- Threat model before implementation and before each major release.
- OWASP ASVS/API controls, object-level authorization tests, input validation, secure headers, and rate limiting.
- Secrets in managed KMS/secret storage, never source control.
- Encryption in transit and at rest.
- Dependency scanning, SAST, secret scanning, and signed build artifacts.
- Append-only security and financial audit logs with retention and access controls.
- Tested backups and recovery procedures.

### Smart contracts

- Unit, integration, invariant, fuzz, and fork tests.
- Independent review before testnet pilot.
- External audit before production escrow handles material value.
- Bug bounty after the contracts and disclosure process are stable.
- Multisig administration and emergency runbooks.
- Contract verification on the block explorer.
- Monitoring for pause, role, upgrade, release, refund, and unusual balance events.

### Abuse cases to test

- fake provider and wallet substitution;
- compromised provider administrator;
- invoice-link enumeration;
- tampered amount or recipient;
- wrong-chain or lookalike-token payment;
- duplicate event/webhook;
- chain reorganization;
- double release or double refund;
- front-running and replay;
- unauthorized milestone approval;
- malicious or deflationary token attempts;
- RPC provider disagreement/outage;
- evidence-file access leakage;
- operator privilege abuse;
- phishing and fraudulent payment links.

---

## 19. Notifications and Receipts

### Initial channels

- email;
- in-app notifications;
- operational alerts.

SMS/WhatsApp should follow only after consent, privacy, delivery, and template controls are designed.

### Notification rules

- Do not declare payment complete before confirmation policy is satisfied.
- Messages contain minimal healthcare detail.
- Every notification has a deduplication key.
- Delivery failure never changes the underlying financial status.

### Receipt verification

Each receipt should have a public verification identifier that returns only the minimum necessary information. The receipt record should include a server signature or content hash so tampering can be detected.

---

## 20. Reporting and Analytics

### Provider metrics

- invoice count and value;
- payment completion rate;
- median time to detection and confirmation;
- outstanding and expired invoice value;
- reconciliation exceptions;
- escrow funded, locked, released, refunded, and disputed.

### Payer funnel

- payment page opened;
- wallet connected;
- correct network selected;
- authorization approved;
- transaction submitted;
- transaction confirmed;
- receipt viewed.

### NGO/program metrics

- program funding;
- allocated, locked, released, refunded, and available balance;
- patients/treatments supported using pseudonymous counts;
- milestone completion time;
- provider distribution;
- exceptions and disputes.

### North-star MVP metric

> Percentage of valid healthcare payment requests that are correctly confirmed, reconciled, and receipted without manual intervention.

### Initial targets for the controlled pilot

- >= 99.9% reconciliation accuracy for supported flows.
- >= 95% of valid transactions detected within the operational target after broadcast.
- 0 duplicate ledger postings or duplicate releases.
- 100% of financial events represented in the audit log.
- < 1% payments requiring manual reconciliation, excluding deliberate edge-case tests.
- 0 sensitive patient data written onchain.

Targets should be revised after testnet and pilot measurements.

---

## 21. MVP Acceptance Criteria

The direct-payment MVP is ready for a controlled production pilot only when:

- a verified provider can register and prove control of its settlement wallet;
- an email user can create an individual or organization account and recover the same embedded wallet on a second device;
- a user can connect an outside wallet using a signed challenge without providing a seed phrase or private key;
- an organization can either verify a separate settlement wallet or explicitly designate an embedded/connected wallet for settlement;
- authorized staff can create and cancel invoices;
- a payer can choose the embedded or connected transaction wallet and pay native USDC;
- supported embedded-wallet payments do not require the payer to hold a separate native gas token;
- the router emits a unique invoice reference;
- the backend independently verifies and reconciles the transaction;
- underpayment, overpayment, duplicate, wrong-network, and wrong-token cases are handled visibly;
- the double-entry ledger remains balanced under retries and indexer replays;
- a tamper-evident receipt is generated;
- monitoring and operational exception queues work;
- privacy, security, and legal launch gates are approved.

Production escrow is ready only when, in addition:

- contract invariants and adversarial tests pass;
- no actor can release or refund more than the locked amount;
- approval policies work for all allowed role combinations;
- dispute and emergency procedures are tested;
- an external contract audit is complete and findings are resolved or formally accepted;
- the legal model for escrow and custody is approved;
- provider, payer, and operations runbooks have been rehearsed.

---

## 22. Development Strategy

### Product architecture strategy

- Start with a modular monolith and a shared PostgreSQL database.
- Isolate the ledger, payment state machine, and blockchain indexer behind strict module APIs.
- Use an outbox pattern so database changes and asynchronous events cannot diverge silently.
- Make all blockchain event handlers idempotent and replayable.
- Generate API schemas and contract ABIs as versioned artifacts.
- Use feature flags for escrow, providers, and jurisdictions.

### Environments

- local development;
- automated CI environment;
- shared development/testnet;
- staging/testnet mirroring production configuration;
- production/mainnet.

Never use production keys or real patient data in non-production environments.

---

## 23. Delivery Roadmap

The roadmap assumes a capable 7-9 person team. Calendar time is an estimate, not a commitment. Legal review, provider onboarding, and contract audit can determine the critical path.

### Phase 0: Discovery and legal architecture, 3-5 weeks

Deliverables:

- 15-25 provider, patient, sponsor, and NGO interviews;
- launch corridor and treatment wedge selection;
- service blueprint and operational process map;
- legal memo on custody, payments, virtual assets, escrow, health data, and NGO flows;
- fund-flow diagrams;
- threat model and privacy impact assessment outline;
- product prototype tested with target users;
- chain evaluation and Privy configuration/custody review;
- go/no-go decision for the proposed operating model.

Exit gate: one clearly legal and operationally supportable pilot model.

### Phase 1: Platform foundation, 3 weeks

Deliverables:

- repositories, CI/CD, environments, infrastructure as code;
- Privy email authentication, Privy MFA, organization membership, and USDCare RBAC;
- email account-type selection, embedded wallet provisioning, connected-wallet verification, and wallet-role assignment;
- account/workspace switching for users who have both an individual profile and organization memberships;
- provider onboarding and review workflow;
- settlement-wallet verification;
- audit event framework;
- database migrations and data classification.

Exit gate: approved provider can securely access an isolated organization workspace.

### Phase 2: Invoices and payer UX, 3 weeks

Deliverables:

- invoice creation and immutable invoice versions;
- public payment link and QR code;
- payer email sign-in, embedded wallet recovery, connected-wallet selection, balance/funding view, and network/token validation;
- payment-router contract on testnet;
- clear pending/error/retry states.

Exit gate: end-to-end testnet payment can be initiated against a real invoice reference.

### Phase 3: Verification, ledger, and receipts, 4 weeks

Deliverables:

- block/event indexer;
- confirmation policy;
- payment state machine;
- double-entry ledger;
- reconciliation jobs and exception queue;
- receipt generation and verification;
- provider payment history and notifications.

Exit gate: repeated and replayed testnet events produce one correct payment and balanced ledger.

### Phase 4: Direct-payment pilot hardening, 3-4 weeks

Deliverables:

- RPC failover/backfill;
- security testing and performance testing;
- analytics and operations dashboards;
- incident, refund, support, and reconciliation runbooks;
- controlled provider training;
- legal/compliance launch checklist;
- testnet pilot followed by tightly limited mainnet pilot.

Exit gate: direct payment MVP meets the acceptance criteria and pilot limits are configured.

### Phase 5: Escrow testnet MVP, 5-7 weeks

Deliverables:

- treatment plans and milestones;
- escrow contracts and event indexer;
- approval policies;
- release, cancellation, refund, dispute, and pause flows;
- escrow ledger and reconciliation;
- provider, patient, and sponsor views;
- invariant/fuzz tests and independent review.

Exit gate: adversarial test suite and full operational rehearsal pass on testnet.

### Phase 6: Escrow audit and limited production pilot, 4-8+ weeks

Deliverables:

- external contract audit;
- remediation and regression tests;
- multisig/key ceremony;
- monitoring and emergency response;
- legal approval for exact escrow terms;
- capped-value mainnet pilot with a small provider cohort.

Exit gate: escrow production acceptance criteria are met.

### Phase 7: Private NGO programs, 4-6 weeks

Deliverables:

- program budgets and allocations;
- NGO roles and approvals;
- treatment escrow funding;
- privacy-preserving reports;
- program-level limits and monitoring.

Open/public fundraising remains a later product with a separate regulatory assessment.

---

## 24. Team

Recommended core team:

- 1 product manager/product lead;
- 1 technical lead/architect;
- 2 backend engineers, one with strong payments/ledger experience;
- 2 frontend/full-stack engineers;
- 1 smart-contract/blockchain engineer;
- 1 QA/SDET focused on automation and financial edge cases;
- 0.5-1 platform/security engineer;
- product designer shared from discovery through delivery;
- external legal/compliance counsel;
- external smart-contract auditor before production escrow.

A smaller team can build a prototype, but reducing dedicated payments, QA, security, or legal expertise materially increases production risk.

---

## 25. Testing Plan

### Unit and property tests

- state-transition guards;
- ledger balancing and escrow invariants;
- amount precision and USDC decimals;
- access-control policies;
- idempotency behavior;
- receipt content and signatures.

### Integration tests

- API to database transaction boundaries;
- outbox and worker retries;
- RPC responses and event decoding;
- payment router to indexer to ledger;
- escrow release/refund to reconciliation;
- email delivery and deduplication.

### End-to-end scenarios

- standard successful payment;
- sponsor pays a patient's invoice;
- wallet rejection and later retry;
- wrong network and wrong token;
- underpayment and top-up;
- overpayment and refund case;
- duplicate payment;
- invoice expiry during payment;
- RPC outage and backfill;
- indexer replay;
- milestone approval and release;
- rejected milestone and resubmission;
- dispute and refund;
- compromised-role simulation;
- provider settlement-wallet change.

### Contract tests

- unauthorized release/refund/admin action;
- double release/refund;
- incorrect milestone amount/order;
- reentrancy;
- pause and recovery;
- expiry boundary conditions;
- approval replay;
- fuzzed milestone schedules;
- invariant that released + refunded never exceeds funded;
- mainnet-fork behavior with the exact native USDC contract.

---

## 26. Operations and Reliability

### Initial service objectives

- 99.9% monthly availability for invoice viewing and payment status during pilot hours.
- No acknowledged financial event lost.
- Recovery point objective for application data <= 5 minutes.
- Recovery time objective <= 4 hours for the initial controlled pilot.
- Blockchain event lag and reconciliation exceptions alerted within minutes.

### Required runbooks

- RPC/indexer outage;
- chain reorganization or finality incident;
- suspicious provider or payer activity;
- compromised operator/provider account;
- contract pause;
- wrong-token payment;
- overpayment/duplicate payment;
- refund and dispute;
- data breach;
- provider settlement-wallet change;
- database restore and ledger reconciliation.

---

## 27. Business Model Hypotheses

Do not finalize pricing before provider discovery and legal review. Test:

- provider SaaS subscription plus a low platform fee;
- payment/reconciliation fee paid by provider;
- escrow creation or release fee;
- NGO program administration/reporting subscription;
- enterprise/API pricing for insurers and employers later.

Avoid taking undisclosed spread on USDC/local-currency conversion. Any off-ramp should be provided transparently by an appropriately licensed partner.

---

## 28. Key Risks and Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Operating model requires licences or regulated partners | Product cannot legally launch | Legal architecture before build; non-custodial design; narrow corridor; licensed partners |
| Providers cannot easily use/off-ramp USDC | Low adoption | Validate provider treasury workflow early; partner integration; transparent settlement options |
| Embedded wallet is empty and users do not know how to fund it | Checkout abandonment | Show network-specific receive flow, connected-wallet funding, exchange guidance, and later regulated on-ramp options |
| Email compromise exposes Privy wallet recovery | Loss or unauthorized signing | Privy OTP controls, passkey/MFA step-up, alerts, session controls, recovery delay, and Privy security/custody review |
| Privy outage or SDK initialization failure | Users cannot sign in or transact | Explicit degraded state, status monitoring, incident runbook, portable USDCare records, and tested recovery/migration plan |
| Administrator uses a personal wallet as organization treasury | Operational and recovery risk | Prefer a separate settlement wallet; show explicit warning; require verification, acknowledgement, and change controls |
| No reliable invoice reference in direct transfers | Reconciliation errors | Payment Router emitting invoice reference |
| Smart-contract defect | Loss or frozen funds | Minimal contracts, invariants, audit, caps, multisig, monitoring, pause/exit plan |
| Provider falsely confirms treatment | Sponsor harm and disputes | Approval policies, evidence, caps, provider verification, dispute process |
| Sensitive data leaks through URLs/logs/onchain events | Privacy breach | Random references, data minimization, log filtering, access control, DPIA |
| RPC/indexer outage causes stale state | Delayed care/payment confirmation | Multi-provider strategy, durable cursors, backfill, explicit delayed state |
| Stablecoin/network risk | Payment or liquidity disruption | Native USDC only, one reviewed chain, risk disclosures, contingency policy |
| Scope expands into EMR, insurance, lending, or open crowdfunding | Delayed and risky MVP | Enforce non-goals and phase gates |

---

## 29. Decisions Required Before Engineering Starts

1. Launch country and provider segment.
2. Exact legal entity and regulated-partner model.
3. Whether USDCare charges or withholds any fee onchain.
4. Network selection after wallet, USDC, finality, reliability, and off-ramp evaluation.
5. Which allowlisted transactions receive sponsored gas, the budget/abuse controls, and the fallback for connected wallets.
6. Provider settlement model: direct wallet, partner account, or both.
7. Identity checks required for providers, payers, sponsors, and NGO users.
8. Direct-payment refund authority and process.
9. Escrow approval policies and value thresholds.
10. Contract immutability versus upgradeability.
11. Data-hosting region, retention schedule, and provider data agreements.
12. Pilot transaction and escrow caps.
13. Privy wallet export policy, recovery configuration, data-processing terms, and vendor failure/migration plan.
14. Whether every organization without an external settlement wallet receives a Privy organization/treasury wallet or may designate an administrator's personal Privy embedded wallet.

---

## 30. Immediate 30-Day Plan

### Week 1

- Select one provider segment and two candidate jurisdictions/corridors.
- Recruit interview participants.
- Draw exact standard-payment and escrow fund flows.
- Engage payments/virtual-assets and healthcare-privacy counsel.
- Create a clickable provider invoice and payer checkout prototype.

### Week 2

- Interview at least five providers, five patients/sponsors, and two healthcare funders.
- Test willingness to receive USDC and the provider off-ramp/accounting workflow.
- Validate who should approve treatment milestones.
- Validate Arc Testnet wallet compatibility, RPC reliability, USDC behavior, explorer support, and the production-network migration path using explicit criteria.
- Draft provider, payer, and escrow terms.

### Week 3

- Finalize the narrow pilot scope.
- Produce the data model, state machines, ledger specification, API outline, and threat model.
- Prototype the Payment Router on testnet.
- Prototype Privy email verification, repeat-device embedded-wallet recovery, Privy external-wallet connection, signed wallet-role verification, and individual/organization workspace creation.
- Validate two supported wallets end to end.
- Decide build/partner boundaries for KYB, screening, notification email, RPC, and off-ramp. Authentication email remains a Privy responsibility.

### Week 4

- Run a design-partner workshop with the selected providers.
- Complete legal go/no-go review for the proposed direct-payment flow.
- Estimate the delivery backlog.
- Approve pilot KPIs, limits, incident process, and ownership.
- Begin Phase 1 only when the operating model and fund flow are approved.

---

## 31. Research-Backed Technical Notes

- USDCare must allowlist Arc Testnet chain ID `5042002` and its exact USDC configuration rather than trusting a token symbol. Testnet USDC has no real-world monetary value.
- Arc network settings must remain configuration-driven so RPC, explorer, native-currency behavior, and future production settlement configuration can change without rewriting business logic.
- OWASP's API Security Top 10 highlights authorization and resource-access risks that are directly relevant to multi-tenant provider, patient, and NGO APIs. Organization scoping must be enforced server-side on every resource.
- Nigeria's Data Protection Act 2023 and its regulator should be treated as a primary legal input if Nigeria is selected. Health information is sensitive data, and a production design requires counsel-led assessment, data minimization, access controls, and an impact assessment.
- FATF guidance treats virtual-asset business models through a risk-based AML/CFT lens. Whether USDCare falls within a regulated category depends on its actual activities, especially custody, control, intermediation, and transfer authority, not merely the product's label.
- Privy's official documentation supports email OTP authentication, automatic embedded-wallet creation on login, external wallet connectors, non-custodial user wallets, wallet export, transaction controls, webhooks, organization/treasury wallets, and smart-wallet gas sponsorship. USDCare will use these Privy capabilities rather than implement custom authentication or private-key infrastructure.

---

## 32. Sources

- [Circle: USDC contract addresses](https://developers.circle.com/stablecoins/usdc-contract-addresses)
- [Arc documentation](https://docs.arc.io/)
- [Nigeria Data Protection Commission](https://ndpc.gov.ng/)
- [Nigeria Data Protection Act 2023](https://ndpc.gov.ng/Files/Nigeria_Data_Protection_Act_2023.pdf)
- [Central Bank of Nigeria](https://www.cbn.gov.ng/)
- [Nigeria Securities and Exchange Commission](https://sec.gov.ng/)
- [FATF: Updated Guidance for a Risk-Based Approach to Virtual Assets and VASPs](https://www.fatf-gafi.org/en/publications/Fatfrecommendations/Guidance-rba-virtual-assets-2021.html)
- [OWASP API Security Top 10, 2023](https://owasp.org/API-Security/editions/2023/en/0x11-t10/)
- [OpenZeppelin Contracts documentation](https://docs.openzeppelin.com/contracts/)
- [Privy: Email OTP authentication](https://docs.privy.io/authentication/user-authentication/login-methods/email)
- [Privy: Embedded wallets](https://docs.privy.io/wallets/overview/embedded)
- [Privy: Connect an external wallet](https://docs.privy.io/wallets/connectors/usage/connecting-external-wallets)
- [Privy: React setup and automatic wallet creation](https://docs.privy.io/basics/react/setup)
- [Privy: EVM gas sponsorship](https://docs.privy.io/wallets/gas-and-asset-management/gas/ethereum)

---

## 33. Final Product Definition

USDCare is not simply a website where hospitals accept crypto.

It is a healthcare financial-control layer that connects a legitimate payment obligation to verifiable stablecoin settlement.

```text
Basic payment:
Request -> Pay -> Verify -> Reconcile -> Settle -> Receipt

Protected treatment funding:
Request -> Fund -> Lock -> Deliver care -> Approve -> Release -> Refund/Complete

Long-term network:
Patient / Family / NGO / Employer / Insurer -> USDCare -> Healthcare Provider
```

The strongest MVP is the smallest version that proves these flows reliably, legally, privately, and without USDCare taking unnecessary custody of customer funds.

---

## 34. Frontend Product and Visual Design

### 34.1 Design direction

The frontend should take inspiration from Privy's current product presentation: precise typography, generous white space, high-contrast text, cool neutral surfaces, restrained electric color, crisp product demonstrations, and smooth motion. USDCare must adapt those qualities to healthcare payments rather than copy Privy's identity, layouts, assets, or proprietary typefaces.

The desired character is:

- trustworthy without looking institutional or bureaucratic;
- technically sophisticated without feeling like a crypto trading product;
- calm enough for patients handling stressful payments;
- dense and efficient enough for provider finance teams;
- transparent about financial status without exposing sensitive medical information.

The product should feel like a modern financial control surface for healthcare. It should not use token-price imagery, coins, speculative language, neon crypto motifs, hospital stock photography, decorative medical crosses, or generic healthcare gradients.

### 34.2 Frontend design thesis

> Money should look visibly connected to care.

The signature visual element is the **Care Rail**: a clear treatment-and-money timeline that joins funding, locked balance, milestone approval, release, receipt, and refund events in one continuous visual system.

```text
[Funded]----[Locked]----[Session 1]----[Released]----[Session 2]----[Complete]
 $1,200      $1,200        verified        $100        pending       $1,200
```

On desktop, the rail can appear horizontally in treatment detail views. On mobile, it becomes a vertical timeline. It is functional, not decorative: each node opens the related transaction, approval, evidence summary, or receipt when the viewer has permission.

### 34.3 Visual token direction

Use a light-first interface for the MVP. A dark theme can follow later after financial-status and accessibility testing.

#### Core colors

| Token | Value | Purpose |
|---|---:|---|
| Ink | `#0A0A12` | Primary text, navigation, primary buttons |
| Paper | `#FFFFFF` | Main application surface |
| Mist | `#F5F7FA` | Page background and grouped controls |
| Cloud | `#E7EBF0` | Borders, dividers, disabled surfaces |
| Trust Blue | `#5B4FFF` | Primary interactive accent and focused financial actions |
| Care Green | `#168B62` | Confirmed care, successful release, verified provider |
| Amber | `#B66A10` | Pending, delayed confirmation, attention required |
| Critical Red | `#C43D4B` | Failed, disputed, destructive, security warning |

Blue must not be used for every surface. The interface should remain predominantly neutral, with green carrying healthcare completion and blue carrying actions and active navigation.

Status meaning must never depend on color alone. Every status needs an icon and a plain-language label.

#### Typography

- **Display and product headings:** Geist Sans or a licensed modern grotesk with open counters and strong numeral clarity.
- **Body and controls:** Geist Sans, 400 and 500.
- **Financial values and technical identifiers:** Geist Mono for amounts in dense tables, transaction hashes, wallet addresses, block numbers, and invoice references.
- Use tabular numerals for dashboards, ledgers, amounts, and timestamps.
- Keep letter spacing at `0`; do not compress headings with negative tracking.
- Use sentence case for navigation, buttons, table headings, and status labels.

Recommended scale:

| Role | Desktop | Mobile | Weight |
|---|---:|---:|---:|
| Marketing/product H1 | 64 px | 42 px | 500-600 |
| Application page title | 32 px | 28 px | 600 |
| Section heading | 22 px | 20 px | 600 |
| Panel heading | 16 px | 16 px | 600 |
| Body | 15-16 px | 15-16 px | 400 |
| Label/table | 13-14 px | 13-14 px | 500 |
| Technical caption | 12 px | 12 px | 400/500 |

Large marketing type must not carry into dashboard cards or operational panels.

#### Shape, border, and elevation

- Default corner radius: 6 px.
- Modal and sheet radius: 8 px.
- Compact controls: 5-6 px.
- Avoid pills except for short statuses, filters, and segmented controls.
- Borders: 1 px solid Cloud or a darker accessible derivative.
- Shadows should be minimal. Prefer borders and surface contrast for hierarchy.
- Do not place cards inside cards. Use full-width page sections and reserve cards for distinct records, tools, or modal content.

#### Spacing

Use a 4 px base grid with primary steps of 8, 12, 16, 24, 32, 48, and 64 px.

- Dashboard content maximum width: 1440 px.
- Public payment flow maximum width: 560 px.
- Data tables use 44-52 px rows depending on information density.
- Desktop application gutters: 24-32 px.
- Mobile gutters: 16 px.

### 34.4 Product shell

#### Provider and NGO application

Desktop uses a fixed left navigation rail with a compact top utility bar.

```text
+------------------+-------------------------------------------------------+
| USDCare          | Provider / Location             Alerts  Help  Account |
|                  +-------------------------------------------------------+
| Overview         | Page title                             Primary action |
| Payments         | Context / filters / date range                        |
| Invoices         +-------------------------------------------------------+
| Escrows          |                                                       |
| Patients         | Main operational content                              |
| Programs         |                                                       |
| Reports          |                                                       |
|                  |                                                       |
| Settings         |                                                       |
+------------------+-------------------------------------------------------+
```

Navigation requirements:

- Use Lucide icons with text labels.
- Keep the active destination visible through fill, icon, and text weight.
- Show organization and location context at the top of the shell.
- Keep `Create invoice` as the main provider action and `Create program` as the main NGO action.
- Put settings and account actions away from daily financial workflows.
- On tablet/mobile, replace the left rail with a top bar and a bottom navigation limited to the four most-used destinations; secondary destinations live in a menu sheet.

#### Email account and wallet onboarding

Account setup should be a short, progressive wizard. Do not present organization verification, wallet terminology, and security disclosures in one overloaded form.

```text
1. Enter email
2. Verify code
3. Choose account type
4. Set up transaction wallet
5. Configure organization settlement wallet, when applicable
6. Review and confirm
```

**Step 1 - Email**

- Heading: `Create your USDCare account`
- Field: `Email address`
- Action: `Continue with email`
- Explain that this email is used for sign-in, receipts, recovery, and security alerts.
- The send-code and login session are handled by Privy's email OTP flow, not a USDCare authentication endpoint.

**Step 2 - Verification**

- Privy's supported email one-time code.
- Show the destination in masked form.
- Actions: `Verify email`, `Resend code`, and `Use a different email`.
- Never reveal whether an unverified email already belongs to an account.

**Step 3 - Account type**

- Heading: `Who is this account for?`
- Two selectable options:
  - `An individual` - For a patient, family member, sponsor, or donor paying personally.
  - `An organization` - For a healthcare provider, NGO, employer, insurer, or other organization.
- Explain that organization accounts require additional verification before they can receive provider payments or operate funding programs.

**Step 4 - Transaction wallet**

- Confirm: `Your built-in wallet is ready.`
- The built-in wallet shown here is the Privy embedded wallet or its configured Privy-supported smart wallet transaction account.
- Show the shortened address, selected network, and an accessible copy action.
- Offer two choices:
  - `Use built-in wallet`
  - `Connect existing wallet`
- A connected wallet uses Privy's external wallet connection flow and the wallet's normal signature UI. USDCare must explicitly state: `USDCare will never ask for your recovery phrase or private key.`
- Let the user choose the default wallet used to make payments and approve actions.

**Step 5 - Organization settlement wallet**

- Ask: `Does your organization already have a separate wallet for receiving payments?`
- `Yes, connect it`: connect the wallet, sign the verification message, label it, and show that provider payments will be sent there.
- `No, use one of these wallets`: let the administrator choose the built-in or connected wallet and then show the shared-wallet warning.
- Warning copy:

> This wallet will be used both to approve transactions and to receive organization funds. A separate settlement wallet is safer because account recovery or unauthorized access could affect your organization's balance.

- Require a checkbox: `I understand how this wallet will be used.`

**Step 6 - Review**

Show a compact wallet-role summary:

```text
Account                 Lakeside Diagnostic Centre
Signed in as            finance@lakeside.example
Transaction wallet      Built-in wallet · 0x71...9A20
Settlement wallet       Treasury Safe · 0x42...183C
Provider payments       Sent to settlement wallet
```

Actions must use exact language: `Create individual account` or `Create organization account`.

After onboarding, show a dismissible wallet guide explaining how to receive native USDC on the selected network. It should include the address, QR code, copy action, network warning, and a link to connect an existing wallet.

#### Patient/payer experience

The public payment page is a focused checkout, not a reduced provider dashboard. It should have no marketing navigation and no distracting product promotion.

```text
+--------------------------------------------------+
| USDCare                          Secure payment   |
+--------------------------------------------------+
| Verified provider                               |
| Lakeside Diagnostic Centre                      |
|                                                  |
| MRI scan                                         |
| Patient reference: PAT-2048                      |
|                                                  |
|                     100.00 USDC                  |
|                 Arc Testnet                     |
|                                                  |
| [ Continue with email ]                          |
|                                                  |
| Expires 18 Aug, 4:30 PM                          |
| Invoice INV-2048                                 |
+--------------------------------------------------+
```

The invoice amount, verified provider, network, token, and primary action must remain visible without scrolling on common mobile viewports.

After email verification, replace the email action with a wallet selector and balance-aware payment action:

```text
Pay with        Built-in wallet  v
Balance         145.20 USDC

[ Pay 100 USDC ]

Use another wallet
```

### 34.5 Screen inventory

#### Public/product surfaces

- USDCare product homepage.
- Provider application/sign-in.
- Provider verification status.
- Public invoice payment page.
- Public payment status page.
- Public receipt verification page.
- Shared treatment funding status page with permission-aware details.
- Legal, privacy, security, and support pages.

The homepage should quickly demonstrate the real product flow with an interactive or animated Care Rail. It should not open with a generic marketing card layout. The first viewport should establish USDCare as healthcare payment and escrow infrastructure, show a real payment/treatment state, and reveal the start of the next section.

Recommended homepage headline:

> Healthcare payments that move with care.

Supporting copy:

> Create healthcare invoices, fund treatment in USDC, and release payment when care is delivered.

Primary calls to action:

- `Join the provider pilot`
- `View a sample payment`

#### Provider screens

- Overview.
- Invoices list and invoice detail.
- Create invoice flow.
- Payments and reconciliation.
- Treatment plans and escrows.
- Escrow detail with Care Rail.
- Patients/patient references.
- Receipts.
- Reports and exports.
- Organization, team, roles, wallets, and security settings.

#### NGO/funder screens

- Program overview.
- Programs list and program detail.
- Create program.
- Treatment allocations.
- Escrow approvals.
- Providers and patients supported.
- Financial reports.
- Program team and settings.

#### Operations screens

- Provider verification queue.
- Payment exceptions.
- Reconciliation runs.
- Disputes.
- Risk cases.
- Contract and chain monitoring.
- Audit events.

### 34.6 Provider overview

The overview should be a work surface, not a wall of decorative statistics.

Above the fold:

- page title and `Create invoice` action;
- today's confirmed payments;
- payments requiring attention;
- active escrow value awaiting release;
- reconciliation status;
- recent payment activity.

Use a compact summary band rather than four oversized cards.

```text
+------------------------------------------------------------------+
| Today            Pending           In escrow       Reconciliation |
| 2,450 USDC       3 payments        8,200 USDC      All matched    |
+------------------------------------------------------------------+
| Payments requiring attention                     View all         |
| Underpaid INV-2091 | 80 / 100 USDC | 12 min ago                  |
+------------------------------------------------------------------+
| Recent payments                                                  |
| Invoice      Patient       Amount      Status        Time          |
| INV-2094     PAT-7210      300 USDC    Confirmed     10:42         |
+------------------------------------------------------------------+
```

### 34.7 Invoice creation experience

Use a two-column desktop workflow with the editable form on the left and a live payer-page preview on the right. On mobile, show the form first and open preview in a full-screen sheet.

Fields:

- patient reference;
- service summary;
- private internal note, explicitly excluded from the payer page;
- amount;
- payment type: direct payment or escrow;
- due date and time;
- partial payment toggle, if the provider is eligible;
- optional payer contact for delivery.

The final action is `Create payment request`. After creation, show the payment link and QR code with icon actions for copy, share, download, and open preview.

### 34.8 Payment interaction states

The checkout should behave like a stateful financial flow rather than showing a generic loading spinner.

#### Ready

- verified provider badge;
- exact amount and token;
- network;
- expiration;
- `Continue with email` before authentication;
- embedded or connected wallet selector after authentication;
- selected wallet balance and, when insufficient, `Add USDC`;
- `Pay 100 USDC` when the selected wallet is ready;
- link to invoice details and payment terms.

#### Email verification and wallet recovery

- keep the invoice summary visible while the user verifies their email;
- provision or recover the embedded wallet without navigating away from the invoice;
- when a wallet is recovered on a new device, show a security notification and require the configured step-up factor where risk policy requires it;
- return the payer to the same invoice state after authentication.

#### Insufficient USDC

- show the selected wallet's exact USDC balance and missing amount;
- action: `Add USDC`;
- show the wallet address and QR code with a prominent network label;
- offer `Connect existing wallet` so the payer can choose or fund from an outside wallet;
- message: `Send only Arc Testnet USDC to this address.` The network and token are configuration-driven, not hardcoded.

#### Wrong network

- clear network mismatch label;
- network selector/switch control;
- no payment action until corrected;
- message: `Switch to Arc Testnet to pay this invoice.`

#### Approval required

- explain that the wallet needs permission to use the exact invoice amount;
- action: `Approve 100 USDC`;
- after approval, advance automatically to payment review.

#### Wallet confirmation

- lock the displayed recipient, amount, token, and network;
- message: `Confirm this payment in your wallet.`
- allow safe cancellation and retry.

#### Submitted and confirming

- show transaction hash, live confirmation status, and explorer action;
- use a gently progressing Care Rail node, not an indeterminate full-page spinner;
- message: `Payment submitted. Waiting for network confirmation.`

#### Confirmed

- show a restrained success transition;
- amount, provider, timestamp, invoice ID, and transaction hash;
- actions: `View receipt`, `Share receipt`, and `Return to invoice`.

#### Delayed

- amber state, not failure red;
- message: `The transaction was found, but confirmation is taking longer than usual.`
- preserve transaction details and update automatically.

#### Failed or rejected

- state exactly what failed and whether funds moved;
- offer the relevant next action;
- never use a vague `Something went wrong` message for financial operations.

### 34.9 Escrow detail experience

The escrow detail page must answer five questions immediately:

1. How much was funded?
2. How much is still locked?
3. How much has been released?
4. What is the current milestone?
5. Who must act next?

Desktop layout:

```text
+------------------------------------------------------------------+
| Kidney dialysis program                         Active            |
| PAT-2048 | Lakeside Dialysis Centre                               |
+------------------------------------------------------------------+
| Funded          Released          Locked           Next action     |
| 1,200 USDC      500 USDC          700 USDC         Session 6       |
+------------------------------------------------------------------+
| Care Rail                                                       > |
| Funded -- S1 -- S2 -- S3 -- S4 -- S5 -- [S6 awaiting provider]    |
+------------------------------------------------------------------+
| Current milestone                    Financial activity            |
| Session 6                             Release 100 USDC              |
| Awaiting provider submission          Session 5, 14 Aug            |
+------------------------------------------------------------------+
```

Milestone completion uses a focused side sheet or modal. The user sees the milestone amount, approval policy, evidence requirements, and irreversible effect before confirming.

### 34.10 Tables, statuses, and financial data

- Default to tables for invoices, payments, releases, and reconciliation because users need to scan and compare records repeatedly.
- Use cards only for mobile records or genuinely separate objects.
- Keep amount and status columns stable to prevent layout shift.
- Right-align numeric amounts and use tabular numerals.
- Truncate hashes and addresses in the middle, with copy and explorer icon actions.
- Use sticky table headers for long operational lists.
- Filters appear in a compact toolbar with search, segmented status control, date range, and filter menu.
- Saved views are P1 for provider finance and operations teams.

Status vocabulary:

| System state | User-facing label |
|---|---|
| `PAYMENT_DETECTED` | Payment found |
| `CONFIRMING` | Confirming |
| `CONFIRMED` | Paid |
| `VERIFICATION_FAILED` | Needs review |
| `UNDERPAID` | Partially paid |
| `OVERPAID` | Overpaid |
| `FUNDED` | Funds secured |
| `PARTIALLY_RELEASED` | In progress |
| `DISPUTED` | Payment paused |
| `REFUNDED` | Refunded |

Technical system states may appear in developer/operations details but should not be the primary language shown to patients.

### 34.11 Components

Required shared components:

- application shell;
- organization/location switcher;
- command/search menu;
- icon button with tooltip;
- status badge;
- amount display;
- wallet/address display;
- transaction link;
- provider verification mark;
- payment state panel;
- Care Rail timeline;
- financial summary band;
- filter toolbar;
- data table;
- activity/audit timeline;
- QR code panel;
- receipt preview;
- confirmation modal;
- responsive side sheet;
- empty, loading, delayed, error, and access-denied states;
- toast and persistent financial alert banner.

Use Lucide icons wherever a suitable symbol exists. Tooltips are required for icon-only actions. Destructive controls use familiar symbols and explicit confirmation text.

### 34.12 Motion and feedback

Motion should feel controlled and physical, similar to Privy's polished product transitions, but quieter because users may be under medical and financial stress.

- Page/panel entrances: 180-240 ms fade and 4-8 px movement.
- Sheets and modals: interruptible spring, approximately 260-360 ms.
- Button feedback: subtle 1-2% scale or surface change, never bouncy.
- Care Rail progress: one orchestrated transition when a financial state changes.
- Confirmed payment: check and rail-node completion, no confetti.
- Skeletons should preserve final layout dimensions.
- Respect `prefers-reduced-motion` and provide an effectively static experience.
- No continuous decorative animation in dashboards or checkout.

### 34.13 Responsive behavior

Required test widths:

- 360 px mobile;
- 390 px mobile;
- 768 px tablet;
- 1024 px laptop;
- 1440 px desktop;
- 1920 px wide desktop.

Rules:

- Public payment actions remain reachable with one thumb and respect safe-area insets.
- Financial values never shrink below readable sizes; surrounding layout wraps instead.
- Tables become structured record rows on narrow screens rather than horizontal page overflow, except where comparison genuinely requires a scrollable table.
- Care Rail switches from horizontal to vertical below tablet width.
- Sticky bottom action bars may be used for payment and milestone confirmation, with content padding preventing overlap.
- Dialogs become full-screen sheets on mobile.
- Wallet names, provider names, service descriptions, and transaction references must wrap or truncate predictably.

### 34.14 Accessibility

- Meet WCAG 2.2 AA for the MVP.
- Full keyboard access for dashboards and checkout.
- Visible focus rings with at least 3:1 contrast against adjacent colors.
- Minimum 44 x 44 px touch targets.
- Programmatic labels for amounts, token, network, status, and transaction links.
- Announce asynchronous payment-state changes through accessible live regions without repeated noise.
- Do not use timer-only interactions without a clear extension or recovery path.
- QR codes must always have an equivalent copyable payment link/action.
- Charts require text/table equivalents.
- Validate color contrast for every status on both white and mist surfaces.

### 34.15 Frontend privacy and security behavior

- Never put patient names, diagnoses, wallet addresses, or treatment descriptions into analytics event properties unless explicitly approved and minimized.
- Public URLs contain random references, not sequential invoice IDs or patient identifiers.
- Mask sensitive patient data by default in shared and operations views.
- Do not expose private internal notes in payment pages, receipt verification, browser titles, previews, or notifications.
- Show the verified provider name and fixed destination before wallet confirmation.
- Display a warning when a user copies an address, including the selected network.
- Expired and cancelled payment links must remain viewable as status records but must not allow payment.

### 34.16 Frontend implementation requirements

- Build shared primitives and tokens before feature screens.
- Use Storybook or an equivalent component workbench for all states.
- Every financial component must include loading, empty, delayed, success, warning, failure, disabled, and permission-denied variants where applicable.
- Use real USDC amounts, long provider names, long service descriptions, and realistic transaction hashes in fixtures.
- Run automated accessibility checks and keyboard tests in CI.
- Use Playwright for provider invoice creation, payer checkout, receipt, milestone release, refund, and responsive critical paths.
- Capture visual-regression screenshots at the required viewport widths.
- Prevent cumulative layout shift when wallet state, amounts, status labels, or notifications change.
- Maintain a frontend event dictionary that excludes sensitive health data.

### 34.17 Frontend acceptance criteria

The frontend is ready for the controlled pilot when:

- a first-time payer can identify the provider, amount, token, network, and next action without assistance;
- provider finance staff can create an invoice and copy its payment link in under two minutes during usability testing;
- payment pages clearly distinguish wallet approval, submission, detection, confirmation, and failure;
- refresh and device-size changes do not lose payment status;
- all payment and escrow states have designed UI, not raw system messages;
- the provider dashboard can be operated at 360, 768, 1024, and 1440 px without overlap or clipped text;
- keyboard-only users can complete every supported flow;
- automated accessibility checks have no critical violations;
- no sensitive patient data appears in public pages, analytics payloads, URLs, logs shown to users, or onchain references;
- visual-regression checks cover checkout, invoice detail, payment confirmation, escrow detail, milestone approval, and receipt views.

### 34.18 Frontend reference

- [Privy](https://www.privy.io/) - reference for visual restraint, typography, high-contrast neutral surfaces, polished product storytelling, and controlled motion. USDCare should use these qualities as directional inspiration while maintaining an original healthcare-finance identity.
