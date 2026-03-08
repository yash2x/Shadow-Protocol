# Shadow Protocol — Privacy Audit Report

**Audit Type:** Privacy & Anonymity Analysis  
**Date:** March 8, 2026  
**Version:** 7.0.0  
**Scope:** On-chain privacy, off-chain metadata leaks, cryptographic strength, network-level privacy, timing analysis resistance  
**Auditor:** Independent Review  

---

## Executive Summary

This audit evaluates Shadow Protocol's ability to provide meaningful financial privacy on Solana. Each privacy layer is graded on a scale from **A** (strong, comparable to established privacy protocols) to **F** (no meaningful privacy).

### Overall Privacy Score: B-

Shadow Protocol provides solid foundational privacy through ZK proofs and encryption, but has significant metadata leakage vectors that reduce effective anonymity, particularly at the network and application layers.

### Privacy Grades by Layer

| Layer | Grade | Summary |
|---|---|---|
| Cryptographic (ZK proofs, Poseidon, Groth16) | **A** | Sound design, standard primitives |
| Deposit/Withdrawal Unlinkability | **B+** | Strong with sufficient anonymity set |
| Stealth Addresses | **B** | Good scheme, some implementation gaps |
| Encrypted Messaging | **A-** | NaCl box is robust, minor metadata exposure |
| Timing Analysis Resistance | **C+** | Randomized delays help but are predictable |
| Network-Level Privacy | **D** | No Tor/onion routing, IP exposed to relayer |
| Metadata Leakage (off-chain) | **C** | Supabase stores queryable metadata |
| Anonymity Set Size | **C** | Small pools limit effective privacy |
| Frontend Privacy | **C-** | Dynamic SDK, Helius RPC leak user data |

---

## Detailed Findings

### [P-01] Anonymity Set Too Small — Grade: C

**Current state:** Pool 0 has 106 deposits, Pool 1 has 2, Pool 2 has 0.

With only 106 deposits in the most active pool, the anonymity set is very small. An attacker observing deposits and withdrawals can significantly narrow down which deposit belongs to a given withdrawal, especially in pools 1 and 2 where the anonymity set is nearly zero.

**Comparison:**
- Tornado Cash had thousands of deposits per pool before meaningful privacy was achieved
- The generally accepted minimum for a usable anonymity set is 100-500+ deposits

**Impact:** Privacy is weak in low-activity pools. Pool 1 (2 deposits) and Pool 2 (0 deposits) offer virtually no privacy.

**Recommendations:**
- **[P-01a]** Add automated "chaff" deposits from protocol-controlled wallets to seed pools with synthetic deposits, increasing the base anonymity set
- **[P-01b]** Display anonymity set size to users so they understand their privacy level before depositing
- **[P-01c]** Consider merging small pools or adding intermediate denominations (0.5 SOL) to concentrate liquidity
- **[P-01d]** Implement a minimum anonymity set warning — if a pool has fewer than 10 deposits, warn the user that privacy is limited

---

### [P-02] Timing Correlation Attack — Grade: C+

**Current state:** Withdrawals are delayed by 30-120 seconds with random jitter. The delay formula is based on pool activity:
- 5+ deposits → 30-60s
- 2-4 deposits → 45-90s  
- 0-1 deposits → 60-120s

**Problem:** The delay ranges are relatively short and follow a predictable distribution. An attacker monitoring both deposit and withdrawal events can perform statistical timing analysis:
- If user A deposits at T=0 and a withdrawal occurs at T=45s, and no other deposits happened nearby, the correlation is trivial
- The delay categories themselves leak information about pool activity
- Inter-hop delays (2-5s) are too short and follow a uniform distribution

**Impact:** Timing analysis can significantly reduce the anonymity set, especially during low-activity periods.

**Recommendations:**
- **[P-02a]** Increase minimum delay to 5-15 minutes with exponential distribution (not uniform)
- **[P-02b]** Batch withdrawals — process multiple withdrawals simultaneously to create ambiguity
- **[P-02c]** Add random "dummy" transactions from relayers to create noise
- **[P-02d]** Use Poisson-distributed delays instead of uniform random — this models natural transaction patterns more closely
- **[P-02e]** Queue withdrawals and execute them in random order, not FIFO

---

### [P-03] Network-Level IP Exposure — Grade: D

**Current state:** Users connect directly to `shadow-protocol.xyz` via HTTPS. The relayer agent receives withdrawal requests from the frontend. No Tor integration, no onion routing, no IP obfuscation.

**Problem:**
- The VPS operator (you) can see all user IP addresses via Nginx access logs
- Helius RPC receives the user's IP address on every Solana RPC call
- Dynamic SDK phones home to `dynamic.xyz` servers with user session data
- Supabase receives the user's IP on every database query
- The faucet endpoint explicitly tracks and stores IP addresses

**Impact:** Even with perfect on-chain privacy, an attacker with access to server logs can correlate deposits/withdrawals by IP address, completely breaking privacy.

**Recommendations:**
- **[P-03a]** Integrate a Tor `.onion` mirror for the website
- **[P-03b]** Proxy all RPC calls through the backend instead of direct client-to-Helius connections
- **[P-03c]** Strip IP addresses from Nginx access logs or reduce log retention to 24h
- **[P-03d]** Add a "Privacy Mode" that routes all requests through the relayer backend, hiding the user's IP from Supabase and Helius
- **[P-03e]** Remove IP tracking from faucet (use wallet address + nonce only) or clearly disclose it
- **[P-03f]** Consider replacing Dynamic SDK with a simpler wallet adapter that doesn't require third-party connections

---

### [P-04] Supabase Metadata Leakage — Grade: C

**Current state:** Supabase stores:
- User registry (pseudo, wallet_address, stealth_meta_key, created_at)
- Pending transfers (recipient_pseudo, encrypted_note, amount, sender_pseudo, created_at)
- Faucet claims (wallet_address, ip_address, amount, tx_signature)
- Dead man vaults (beneficiary_pseudo, amount, interval, last_checkin)
- Completed withdrawals (id, amount, final_signature)
- Notifications (recipient_pseudo, type, message, amount, sender_pseudo)

**Problem:**
- `sender_pseudo` in pending_transfers links sender identity to a transfer, even though the note is encrypted
- `amount` in pending_transfers correlates with deposit pool sizes
- `created_at` timestamps on all tables enable timing analysis
- `wallet_address` in users table links pseudonyms to public keys
- Supabase (a third party) has access to all this data
- No Row-Level Security (RLS) policies verified

**Impact:** An attacker with Supabase access (data breach, subpoena, insider) can reconstruct most transaction relationships from metadata alone, even without breaking encryption.

**Recommendations:**
- **[P-04a]** Remove `sender_pseudo` from pending_transfers — the sender should be anonymous
- **[P-04b]** Add random jitter (±minutes) to all `created_at` timestamps
- **[P-04c]** Hash wallet addresses before storing (store `SHA256(wallet_address)` for lookups)
- **[P-04d]** Implement Supabase RLS policies to ensure users can only read their own data
- **[P-04e]** Consider replacing Supabase with a self-hosted PostgreSQL to eliminate third-party data access
- **[P-04f]** Encrypt `amount` field or remove it from pending_transfers (it can be derived from the encrypted note)
- **[P-04g]** Implement automatic data deletion — purge claimed transfers and old notifications after 7-30 days

---

### [P-05] RPC and Wallet SDK Privacy Leaks — Grade: C-

**Current state:**
- Frontend connects directly to Helius RPC (`api.devnet.solana.com` or Helius endpoint)
- Dynamic SDK loads from `dynamic.xyz` CDN and establishes sessions
- Client-side ZK proof generation is good (no proof data sent to third parties)

**Problem:**
- Every `getBalance`, `getTransaction`, `sendTransaction` call goes to Helius/Solana RPC with the user's IP and wallet address
- Helius can correlate wallet addresses with IP addresses and browsing patterns
- Dynamic SDK has its own analytics and session tracking
- The browser's Web3 wallet (Phantom, etc.) may also phone home

**Impact:** Third-party services can build a complete profile of user activity even if on-chain privacy is maintained.

**Recommendations:**
- **[P-05a]** Run a local Solana RPC proxy on the VPS — frontend connects to your proxy, proxy forwards to Helius. This hides user IPs from Helius
- **[P-05b]** Evaluate Dynamic SDK's privacy policy and data collection practices
- **[P-05c]** Offer a "paranoid mode" where users can input their own RPC endpoint
- **[P-05d]** Generate ZK proofs in a Web Worker to prevent UI fingerprinting

---

### [P-06] Relayer Centralization — Grade: C

**Current state:** All 5 relayer wallets are controlled by a single operator. Multi-hop routing goes through these 5 wallets with 2-5s inter-hop delays.

**Problem:**
- The operator can see the full path of every withdrawal (source vault → hops → destination)
- Multi-hop provides no additional privacy since all hops are controlled by the same entity
- The relayer knows the mapping between nullifier hash and recipient address
- If the relayer is compromised or subpoenaed, all withdrawal privacy is lost

**Impact:** Relayer centralization is the single biggest privacy weakness. The operator has a complete record of every withdrawal.

**Recommendations:**
- **[P-06a]** Implement a decentralized relayer network where independent operators run relayer nodes
- **[P-06b]** Use threshold encryption — split the withdrawal request so no single relayer sees the full path
- **[P-06c]** Implement encrypted relay requests — the relayer should only see the proof and the final hop, not the complete chain
- **[P-06d]** As an interim measure, implement a "no-logs" policy and auto-delete relay records after 24h
- **[P-06e]** Publish relay statistics without identifying data to build trust

---

### [P-07] Stealth Address Implementation Gaps — Grade: B

**Current state:** Stealth addresses use X25519 ECDH with tweetnacl. The scan/spend keypair model follows Monero's design.

**Strengths:**
- Sound cryptographic primitives (X25519, XSalsa20-Poly1305)
- One-time addresses prevent address reuse
- Only the recipient can detect incoming payments

**Gaps:**
- Stealth meta-keys are stored in Supabase in plaintext — anyone with DB access can see all stealth public keys
- The ephemeral public key is likely stored alongside the transfer, linking the stealth payment to a timing window
- No scan key rotation mechanism — if the scan key is compromised, all past and future stealth payments are linkable
- Registration endpoint previously lacked signature verification (fixed in security audit)

**Recommendations:**
- **[P-07a]** Implement scan key rotation — users should be able to generate new stealth meta-keys periodically
- **[P-07b]** Store stealth meta-keys encrypted (encrypt with user's wallet signature)
- **[P-07c]** Add a key derivation mechanism so multiple stealth meta-keys can be derived from a single seed

---

### [P-08] Encrypted Messaging Metadata — Grade: A-

**Current state:** Messages are encrypted with NaCl `box` (X25519-XSalsa20-Poly1305). Nonces are random. Encryption happens client-side.

**Strengths:**
- Strong authenticated encryption
- Server never sees plaintext
- Random nonce generation prevents nonce reuse

**Gaps:**
- Message length is visible — even encrypted, the size reveals information (short = likely a note hash, long = personal message)
- `sender_public_key` is stored in plaintext alongside the encrypted message, linking the sender's encryption key to the message
- Message timestamps in the database enable timing analysis

**Recommendations:**
- **[P-08a]** Pad all encrypted messages to a fixed size (e.g., 1KB) to prevent length analysis
- **[P-08b]** Use ephemeral encryption keys per message instead of a persistent sender key
- **[P-08c]** Consider a message expiry mechanism — auto-delete after recipient reads

---

### [P-09] Frontend Fingerprinting — Grade: C

**Current state:** Standard Next.js web application with no anti-fingerprinting measures.

**Problem:**
- Browser fingerprinting (canvas, WebGL, fonts, screen size) can identify users across sessions
- localStorage stores encryption keys — if another site can access this (XSS), keys are compromised
- Web Audio API usage (sound effects) creates a unique audio fingerprint
- The application does not clear sensitive data from memory after use

**Recommendations:**
- **[P-09a]** Add a "Clear Session" button that wipes localStorage, sessionStorage, and in-memory keys
- **[P-09b]** Move key storage to an encrypted IndexedDB with user PIN/password
- **[P-09c]** Minimize unique browser API usage that contributes to fingerprinting
- **[P-09d]** Add Content Security Policy headers to prevent XSS attacks that could steal keys
- **[P-09e]** Consider offering a stripped-down "privacy mode" UI with minimal JS and no third-party dependencies

---

### [P-10] Deposit/Withdrawal Pattern Analysis — Grade: B

**Current state:** Fixed denominations (0.1 / 1 / 10 SOL) prevent amount-based correlation. ZK proofs hide which deposit is being withdrawn.

**Strengths:**
- Fixed denominations eliminate amount correlation
- Groth16 proofs are zero-knowledge — no information about the deposit leaks
- Merkle tree with depth 20 supports 1M+ deposits
- Nullifier system prevents double-spend without revealing deposit index

**Gaps:**
- If a user deposits 10 SOL to pool 2 and no one else has deposits in pool 2, the withdrawal is trivially linkable
- Users who deposit and withdraw in the same session from the same IP are linkable via server logs
- The on-chain deposit transaction reveals the depositor's wallet address — if this address is KYC'd elsewhere, the deposit is identifiable

**Recommendations:**
- **[P-10a]** Advise users to wait for multiple deposits after theirs before withdrawing
- **[P-10b]** Display a "privacy strength" indicator based on anonymity set size and recent activity
- **[P-10c]** Recommend users deposit from a clean wallet (not linked to any exchange or KYC service)
- **[P-10d]** Consider adding a "time-lock" feature that prevents withdrawal for a minimum period after deposit

---

## Privacy Comparison Matrix

| Feature | Shadow Protocol | Tornado Cash | Monero | Zcash |
|---|---|---|---|---|
| Zero-knowledge proofs | ✅ Groth16 | ✅ Groth16 | ❌ (Ring sigs) | ✅ Groth16 |
| Fixed denominations | ✅ | ✅ | ❌ (Any amount) | ❌ (Any amount) |
| Stealth addresses | ✅ | ❌ | ✅ | ❌ |
| Encrypted messaging | ✅ | ❌ | ❌ | ✅ (Memo field) |
| Decentralized relayer | ❌ Single operator | ✅ | N/A | N/A |
| Anonymity set | ~100 | ~10,000+ | All TXs | Shielded pool |
| Network privacy (Tor) | ❌ | ❌ | ❌ (Dandelion++) | ❌ |
| Metadata protection | Partial | Partial | Strong | Moderate |
| Dead man switch | ✅ | ❌ | ❌ | ❌ |
| Time-tested | ❌ New | ✅ Years | ✅ Years | ✅ Years |

---

## Priority Recommendations (Implementation Order)

### Phase 1 — Quick Wins (1-2 weeks)

1. **[P-05a]** RPC proxy — route all Solana RPC calls through your VPS backend to hide user IPs from Helius
2. **[P-04a]** Remove `sender_pseudo` from pending_transfers
3. **[P-01d]** Add anonymity set size warning in the UI
4. **[P-04g]** Auto-delete claimed transfers and old data after 30 days
5. **[P-03c]** Reduce Nginx log retention to 24 hours
6. **[P-08a]** Pad encrypted messages to fixed size
7. **[P-09a]** Add "Clear Session" button

### Phase 2 — Medium Effort (2-4 weeks)

8. **[P-02a]** Switch to Poisson-distributed delays (5-15 min range)
9. **[P-02b]** Batch withdrawal execution
10. **[P-01a]** Automated chaff deposits to seed anonymity sets
11. **[P-04c]** Hash wallet addresses in database
12. **[P-03d]** "Privacy Mode" that routes through backend
13. **[P-07a]** Stealth key rotation mechanism
14. **[P-10b]** Privacy strength indicator in UI

### Phase 3 — Major Features (1-3 months)

15. **[P-06a]** Decentralized relayer network
16. **[P-03a]** Tor `.onion` mirror
17. **[P-04e]** Replace Supabase with self-hosted PostgreSQL
18. **[P-06b]** Threshold encryption for relay requests
19. **[P-10d]** Time-lock deposits

---

## Conclusion

Shadow Protocol achieves a **B- overall privacy grade**, which is strong for a beta protocol on Solana devnet. The cryptographic foundations (Groth16, Poseidon, NaCl box, X25519 stealth addresses) are sound and follow established patterns from Tornado Cash and Monero.

The primary privacy weaknesses are:
1. **Small anonymity sets** — the protocol needs more users/deposits to provide meaningful privacy
2. **Centralized relayer** — the operator has complete visibility into withdrawal paths
3. **Network-level exposure** — user IPs are visible to multiple third parties (Helius, Dynamic, Supabase)
4. **Metadata in Supabase** — even with encrypted content, the metadata enables significant analysis

The Phase 1 quick wins can elevate the privacy grade to **B+** without major architectural changes. Implementing the full Phase 1-3 roadmap would bring it to **A-** range, comparable to established privacy protocols.

---

*This report was generated as part of an internal privacy review. It does not constitute a formal privacy audit. The privacy grades are qualitative assessments based on comparison with established privacy protocols.*
