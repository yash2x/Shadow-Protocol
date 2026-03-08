# Shadow Protocol — Security Audit Report

**Audit Type:** Internal Code Review  
**Date:** March 8, 2026  
**Version:** 6.9.0  
**Scope:** Relayer Agent, Merkle Tree, ZK Verification, API Routes, Client-Side Cryptography, Infrastructure  
**Auditor:** Independent Review  

---

## Executive Summary

Shadow Protocol is a privacy-preserving payment layer on Solana using ZK-SNARKs (Groth16), Merkle trees, multi-hop relaying, stealth addresses, end-to-end encrypted messaging, and a dead man switch mechanism.

This audit covers the off-chain components: the relayer agent (`agent/index.js`), Merkle tree implementation (`agent/merkle.js`), ZK proof verification, API routes, client-side cryptographic operations, and infrastructure configuration.

**Note:** The on-chain Anchor/Rust smart contract and the Circom circuits were compiled and deployed separately and are not included in the current repository source. The ZK verification key (`verification_key.json`) was analyzed for structural correctness.

### Summary of Findings

| Severity | Count |
|----------|-------|
| Critical | 2 |
| High | 3 |
| Medium | 5 |
| Low | 4 |
| Informational | 5 |

---

## Critical Findings

### [C-01] Nullifier Set Not Persisted Across Restarts

**Location:** `agent/index.js` — Line 58  
**Severity:** Critical  

The `usedNullifiers` set is stored only in memory:
```
const usedNullifiers = new Set();
```

If the agent process restarts (crash, deploy, server reboot), all nullifier records are lost. This allows previously used nullifiers to be reused, enabling **double-spend attacks**.

**Impact:** An attacker can withdraw the same deposit multiple times by waiting for an agent restart.

**Recommendation:**  
Persist nullifiers to the database (Supabase) or disk on every withdrawal. On startup, reload all used nullifiers before accepting any withdrawal requests.

```javascript
// On startup:
const { data } = await supabaseAdmin.from('completed_withdrawals').select('nullifier_hash');
data.forEach(row => usedNullifiers.add(row.nullifier_hash));

// On each withdrawal:
usedNullifiers.add(nullifierHash);
await supabaseAdmin.from('used_nullifiers').insert({ nullifier_hash: nullifierHash });
```

---

### [C-02] No Rate Limiting on Withdraw Endpoint

**Location:** `agent/index.js` — `/withdraw` route  
**Severity:** Critical  

The `/withdraw` endpoint has no rate limiting. An attacker could flood the withdrawal queue with requests, potentially causing:
- Denial of service (queue overflow)
- Relayer wallet balance drainage through transaction fees
- Memory exhaustion from unbounded `withdrawQueue` array

**Impact:** Service disruption and potential fund loss from relayer wallets.

**Recommendation:**  
Add rate limiting per IP and per wallet address. Implement a maximum queue size. Consider requiring a small fee or proof-of-work to submit withdrawals.

---

## High Severity Findings

### [H-01] Withdrawal Queue Unbounded Growth

**Location:** `agent/index.js` — `withdrawQueue` array  
**Severity:** High  

The `withdrawQueue` array grows indefinitely. Completed withdrawals remain in memory. Over time this will consume all available RAM.

**Recommendation:**  
Remove completed/failed withdrawals from the queue after processing. Implement a maximum queue size (e.g., 100 pending).

```javascript
// After processing, clean up:
const index = withdrawQueue.findIndex(w => w.id === withdrawal.id);
if (index !== -1) withdrawQueue.splice(index, 1);
```

---

### [H-02] Merkle Root History Limited to 100

**Location:** `agent/merkle.js` — `insert()` method  
**Severity:** High  

The root history stores only the last 100 roots. If more than 100 deposits occur between a user's deposit and their withdrawal attempt, their root will no longer be recognized, effectively **locking their funds**.

**Impact:** Users may be unable to withdraw if pool activity is high.

**Recommendation:**  
Increase root history size significantly (e.g., 10,000) or store all roots persistently. The on-chain contract should be the source of truth for valid roots.

---

### [H-03] CORS Allows All Origins

**Location:** `agent/index.js` — Line 12  
**Severity:** High  

```
app.use(cors());
```

This allows any website to call the agent API. A malicious site could submit fraudulent withdrawal requests or interact with the faucet on behalf of users.

**Recommendation:**  
Restrict CORS to the production domain:
```javascript
app.use(cors({ origin: ['https://shadow-protocol.xyz'] }));
```

---

## Medium Severity Findings

### [M-01] No Input Validation on Deposit Commitment

**Location:** `agent/index.js` — `/deposit` route  
**Severity:** Medium  

The deposit route accepts any value as a commitment without validation. There is no check that:
- The commitment is a valid field element (within BN128 scalar field)
- The commitment is not zero
- The commitment has not been used before (duplicate deposits)

**Recommendation:**  
Validate that the commitment is a non-zero BigInt within the BN128 scalar field order. Check for duplicate commitments.

---

### [M-02] Faucet IP Spoofing via Headers

**Location:** `agent/index.js` — `getClientIP()` function  
**Severity:** Medium  

The IP detection relies on `x-forwarded-for` and `x-real-ip` headers, which can be spoofed if the reverse proxy is not properly configured.

**Impact:** Faucet cooldown bypass — an attacker can claim unlimited devnet SOL.

**Recommendation:**  
Ensure Nginx is configured to overwrite (not append) `X-Forwarded-For` and `X-Real-IP` headers. On devnet this is low impact but should be fixed before mainnet.

---

### [M-03] No Authentication on Deposit/Withdraw Routes

**Location:** `agent/index.js` — `/deposit` and `/withdraw` routes  
**Severity:** Medium  

These routes have no authentication mechanism. Anyone who discovers the agent URL can interact with it directly, bypassing the frontend.

**Recommendation:**  
Consider adding API key authentication, request signing, or origin validation. The ZK proof requirement on withdrawals provides some protection, but deposits are fully unprotected.

---

### [M-04] Dead Man Switch Checker Interval Too Long

**Location:** `agent/index.js` — `setInterval(checkDeadManVaults, 60 * 60 * 1000)`  
**Severity:** Medium  

The dead man switch is checked every hour. This means a vault could trigger up to 1 hour late.

**Recommendation:**  
Reduce to 5-15 minutes for more timely execution, or make the interval configurable.

---

### [M-05] Fallback Values Still Present in Agent

**Location:** `agent/index.js` — Lines 21-24  
**Severity:** Medium  

While the actual secrets have been removed, the fallback pattern with `REDACTED` placeholder strings means the agent will silently start with invalid credentials if environment variables are missing, rather than failing fast.

**Recommendation:**  
Remove fallback values entirely and throw on missing env vars (same pattern as the fixed `supabase.ts`).

---

## Low Severity Findings

### [L-01] Merkle Tree Persistence Race Condition

**Location:** `agent/merkle.js` — `saveToDisk()` / `loadFromDisk()`  
**Severity:** Low  

Merkle tree state is saved to JSON files on every deposit. If the process crashes mid-write, the file could be corrupted.

**Recommendation:**  
Write to a temporary file first, then atomically rename.

---

### [L-02] No Error Handling on Relayer Balance Check

**Location:** `agent/index.js` — `executeWithdrawal()`  
**Severity:** Low  

The withdrawal execution does not check if the relayer wallet has sufficient balance before attempting the transaction.

**Recommendation:**  
Check relayer balance before executing. If insufficient, select a different relayer or queue for retry.

---

### [L-03] Transaction Confirmation Without Timeout

**Location:** `agent/index.js` — `confirmTransaction()` calls  
**Severity:** Low  

Solana `confirmTransaction` can hang if the network is congested. No timeout is set.

**Recommendation:**  
Add a timeout and retry logic with exponential backoff.

---

### [L-04] Stealth Address API No Auth

**Location:** `src/app/api/stealth/register/route.ts`  
**Severity:** Low  

The stealth meta-key registration endpoint accepts any wallet address without verifying ownership (no signature verification).

**Recommendation:**  
Require a signed message proving wallet ownership before allowing stealth key registration.

---

## Informational Findings

### [I-01] ZK Verification Key Structure Valid

The `verification_key.json` uses Groth16 on BN128 with 2 public inputs (Merkle root and nullifier hash). The IC array contains 3 points (1 base + 2 public inputs), which is correct. The curve points appear well-formed.

### [I-02] Circuit Design Analysis

Based on the verification key structure (2 public inputs, BN128, Groth16), the circuit follows the standard Tornado Cash mixer pattern: proving knowledge of a (secret, nullifier) pair whose Poseidon hash commitment exists in a Merkle tree of depth 20, while revealing only the root and nullifier hash.

### [I-03] Multi-Hop Relay Implementation

The multi-hop system (1-3 random hops through 5 relayer wallets with 2-5s inter-hop delays) provides reasonable timing obfuscation. However, all relayers are controlled by the same operator, so this is defense-in-depth rather than true decentralization.

### [I-04] Encryption Scheme

Client-side encryption uses NaCl `box` (X25519-XSalsa20-Poly1305), which is a well-established authenticated encryption scheme. Key generation and nonce handling appear correct with `nacl.randomBytes()` for nonce generation.

### [I-05] Stealth Address Implementation

The stealth address scheme uses X25519 ECDH with Poseidon-derived shared secrets. This follows the general pattern of Monero-style stealth addresses adapted for NaCl primitives. The implementation appears functionally correct.

---

## Recommendations Summary (Priority Order)

1. **[Critical]** Persist nullifier set to database — prevents double-spend after restart
2. **[Critical]** Add rate limiting to `/withdraw` and `/deposit` endpoints
3. **[High]** Restrict CORS to production domain
4. **[High]** Clean up withdrawal queue after processing
5. **[High]** Increase Merkle root history or persist all roots
6. **[Medium]** Remove env var fallbacks — fail fast on missing config
7. **[Medium]** Add input validation on deposit commitments
8. **[Medium]** Add authentication/signing to sensitive routes
9. **[Low]** Atomic file writes for Merkle persistence
10. **[Low]** Add relayer balance checks and transaction timeouts

---

## Scope Limitations

This audit does **not** cover:
- The on-chain Solana/Anchor smart contract (Rust source not in repository)
- The Circom ZK circuit source code (compiled artifacts only)
- The trusted setup ceremony for the Groth16 proving system
- Frontend UI security (XSS, CSRF)
- Server/VPS hardening and network security
- Supabase Row-Level Security (RLS) policies

A complete security posture requires auditing these components as well. A formal audit by a specialized firm (OtterSec, Sec3, Trail of Bits) is recommended before any mainnet deployment.

---

## Conclusion

Shadow Protocol demonstrates a solid understanding of privacy protocol design with proper use of ZK-SNARKs, Merkle trees, and established cryptographic primitives. The most critical issues relate to state persistence (nullifier set) and input validation (rate limiting), both of which are common in early-stage protocols and straightforward to fix.

The protocol is **suitable for devnet/testnet use** in its current state. The critical findings must be addressed before any mainnet deployment or handling of real funds.

---

*This report was generated as part of an internal code review. It does not constitute a formal security audit. For mainnet deployment, a professional audit from a recognized security firm is strongly recommended.*
