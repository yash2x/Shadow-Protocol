# Shadow Protocol

**Privacy-first transaction layer on Solana — Anonymous transfers, encrypted messaging, stealth addresses & dead man switch.**

[![Website](https://img.shields.io/badge/Website-shadow--protocol.xyz-00DC82?style=flat-square)](https://shadow-protocol.xyz)
[![Solana](https://img.shields.io/badge/Solana-Devnet-9945FF?style=flat-square&logo=solana)](https://solana.com)
[![Audit](https://img.shields.io/badge/Security_Audit-Passed-00DC82?style=flat-square&logo=shield)](audits/2026-03-08-internal-review.md)
[![Privacy](https://img.shields.io/badge/Privacy_Audit-B+-00DC82?style=flat-square&logo=shield)](audits/2026-03-08-privacy-review.md)
[![License](https://img.shields.io/badge/License-MIT-white?style=flat-square)](LICENSE)

---

## Overview

Shadow Protocol is a privacy-preserving payment layer built on Solana. It combines zero-knowledge proofs, stealth addresses, end-to-end encrypted messaging, and a dead man switch mechanism to provide comprehensive financial privacy on a public blockchain.

The protocol enables users to deposit SOL into anonymity pools, transfer ownership privately via encrypted notes, and withdraw funds to any wallet — with no on-chain link between sender and recipient.

**Network:** Solana Devnet  
**Status:** Beta — internally audited, privacy hardened

---

## Security & Privacy Audits

Shadow Protocol has undergone two internal reviews covering security vulnerabilities and privacy analysis.

### Security Audit — All Findings Resolved
14 findings identified and fixed (2 Critical, 3 High, 5 Medium, 4 Low). Full report: [`audits/2026-03-08-internal-review.md`](audits/2026-03-08-internal-review.md)

### Privacy Audit — Grade B+
10 privacy vectors analyzed across cryptographic, network, metadata, and timing layers. Full report: [`audits/2026-03-08-privacy-review.md`](audits/2026-03-08-privacy-review.md)

**Security measures:**
- Persistent nullifier tracking (anti-double-spend across restarts)
- Rate limiting on all sensitive endpoints
- CORS restricted to production domain
- Input validation on all deposit commitments
- Transaction confirmation timeouts
- Relayer balance verification before execution
- Wallet signature verification on stealth registration

**Privacy hardening:**
- Poisson-distributed withdrawal delays (2-30 min) — resists timing analysis
- Batch withdrawal execution in random order — breaks FIFO correlation
- Dummy transactions between relayers — generates on-chain noise
- No-logs policy — no recipient addresses stored in logs or database
- Auto-cleanup — claimed transfers deleted after 7 days, faucet claims after 30 days
- RPC proxy — all Solana RPC calls routed through backend, user IPs hidden from Helius
- Message padding — all encrypted messages padded to fixed 1KB to prevent length analysis
- Anonymity set indicators — users warned when pool privacy is weak
- Nginx log rotation — access logs retained maximum 24 hours

> A formal audit by a specialized firm (OtterSec, Sec3) is planned before mainnet deployment.

---

## Core Features

### Anonymous Transfers (ZK Mixer)
Deposit SOL into shared anonymity pools (0.1 / 1 / 10 SOL). Withdrawals use Groth16 ZK-SNARKs to prove ownership of a deposit without revealing which one. A relayer network executes withdrawals with Poisson-distributed delays (2-30 min) and random execution order to resist timing analysis.

### Stealth Addresses
Inspired by Monero's stealth address scheme. Each user generates a stealth meta-key (scan + spend keypairs). Senders derive one-time addresses from the recipient's public meta-key using ECDH — only the recipient can detect and spend incoming payments. Implemented with `tweetnacl` (X25519 + XSalsa20-Poly1305).

### End-to-End Encrypted Messaging
Users can exchange encrypted messages tied to transactions. Messages are encrypted client-side using NaCl `box` (X25519-XSalsa20-Poly1305) and padded to a fixed 1KB size before storage — the server never sees plaintext and cannot perform length analysis. Keypairs are derived per-user and stored locally.

### Dead Man Switch
A configurable vault system that automatically releases funds to designated recipients if the owner fails to check in within a set time window. Trigger mechanism runs server-side via the relayer agent (checked every 10 minutes). Designed for inheritance planning and emergency fund distribution.

### Embedded Wallet (Dynamic)
Wallet creation and connection handled via [Dynamic](https://dynamic.xyz) SDK — supports embedded wallets (email/social login) alongside traditional Solana wallets (Phantom, Solflare, Backpack). Reduces onboarding friction for non-crypto-native users.

### Helius RPC Integration
Solana RPC calls proxied through the backend server to hide user IP addresses from third-party RPC providers. Enhanced reliability and access to enriched transaction data on devnet.

---

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                      Client (Browser)                    │
│                                                          │
│  Next.js 14 · React · TypeScript · Tailwind CSS          │
│  Dynamic SDK (wallet) · snarkjs (ZK proofs)              │
│  tweetnacl (encryption · stealth addresses)              │
└──────────────┬──────────────────────┬────────────────────┘
               │                      │
               ▼                      ▼
┌──────────────────────┐   ┌──────────────────────────────┐
│     Supabase         │   │   Relayer Agent v7.1.0       │
│                      │   │                               │
│  PostgreSQL:         │   │  - Poisson-delayed withdrawals│
│  · User registry     │   │  - Batch random execution     │
│  · Encrypted notes   │   │  - Dummy tx noise generation  │
│  · Stealth meta-keys │   │  - Multi-hop relaying (1-3)   │
│  · Dead man vaults   │   │  - Dead man switch (10 min)   │
│  · Notifications     │   │  - No-logs policy             │
│                      │   │  - Auto-cleanup (7d/30d)      │
│                      │   │  - Rate limiting               │
│                      │   │  - 5 relayer wallets           │
└──────────────────────┘   └──────────────┬────────────────┘
                                          │
               ┌──────────────────────────┤
               ▼                          ▼
┌──────────────────────┐   ┌──────────────────────────────┐
│   RPC Proxy          │   │     Solana Devnet             │
│                      │   │                               │
│  Hides user IPs      │   │  Anchor program:              │
│  from Helius/RPC     │   │  · 3 anonymity pools          │
│  providers            │   │    (0.1 / 1 / 10 SOL)        │
│                      │   │  · Merkle tree (depth 20)     │
└──────────────────────┘   │  · On-chain ZK verification   │
                           │  · Nullifier tracking         │
                           └──────────────────────────────┘
```

---

## Technology Stack

| Layer | Technology | Purpose |
|---|---|---|
| Smart Contract | Rust · Anchor Framework | On-chain pools, Merkle trees, ZK verification |
| ZK Circuits | Circom · Groth16 | Withdrawal proofs (Poseidon hash, ~500-1000 constraints) |
| Frontend | Next.js 14 · React · TypeScript | SPA with SSR, client-side proof generation |
| Styling | Tailwind CSS | Cyberpunk minimal aesthetic |
| Wallet | Dynamic SDK | Embedded + external wallet support |
| RPC | Helius (proxied) | Enhanced Solana RPC, IP-hidden |
| Encryption | tweetnacl · nacl-util | Stealth addresses, E2E messaging (X25519) |
| Relayer | Node.js · express-rate-limit | Privacy-hardened automated withdrawals |
| Database | Supabase (PostgreSQL) | User data, encrypted notes, auto-cleaned |
| Hosting | VPS · systemd · Nginx | Production deployment |

---

## Privacy Model

### What is hidden
- Link between deposit and withdrawal addresses
- Which deposit belongs to which user (ZK proof)
- Transaction timing (Poisson-distributed delays, random batch order)
- Message content (E2E encrypted, fixed-size padding)
- Message length (1KB padding prevents length analysis)
- Receiving addresses (stealth address derivation)
- User IP addresses (RPC proxy hides from third parties)
- Withdrawal recipient addresses (no-logs policy, not stored in DB)

### What is visible
- Deposit and withdrawal events on-chain (amounts are fixed per pool)
- That someone is using Shadow Protocol
- Pool balances

### Trust assumptions
- Smart contract code is open source and verifiable
- ZK proofs are verified on-chain (trustless)
- Relayer is trusted for timing obfuscation (not for fund custody)
- Supabase stores only encrypted/hashed data with auto-cleanup

---

## Project Structure

```
shadow-protocol/
├── src/
│   ├── app/
│   │   ├── page.tsx              # Landing page
│   │   ├── main/page.tsx         # Main app (mixer, messaging, stealth)
│   │   ├── deadman/page.tsx      # Dead man switch interface
│   │   ├── docs/page.tsx         # Documentation
│   │   └── api/
│   │       ├── rpc/              # RPC proxy (hides user IPs)
│   │       ├── stealth/register/ # Stealth meta-key registration
│   │       └── deadman/trigger/  # Dead man switch trigger
│   ├── components/
│   │   ├── WalletContextProvider.tsx
│   │   ├── AnimatedBackground.tsx
│   │   ├── HowItWorks.tsx
│   │   └── SolanaCoin3D.tsx
│   ├── lib/supabase.ts           # Supabase client
│   ├── config.ts                 # Program IDs, pool addresses
│   └── providers.tsx             # Dynamic SDK provider
├── agent/
│   ├── index.js                  # Relayer agent v7.1.0-privacy
│   ├── merkle.js                 # Merkle tree (10K root history)
│   ├── cleanup.js                # Privacy auto-cleanup script
│   ├── fund-relayers.js          # Utility: fund relayer wallets
│   └── generate-wallets.js       # Utility: generate relayer keypairs
├── audits/
│   ├── 2026-03-08-internal-review.md  # Security audit report
│   └── 2026-03-08-privacy-review.md   # Privacy audit report
├── public/
│   ├── zk/                       # ZK artifacts (wasm, zkey, vkey)
│   ├── sounds/                   # UI sound effects
│   └── images/                   # Assets
└── .env.example                  # Environment variables template
```

---

## Getting Started

### Prerequisites

- Node.js 18+
- A Solana wallet (Phantom, Solflare, or use the embedded wallet)
- Devnet SOL — [faucet.solana.com](https://faucet.solana.com)

### Local Development

```bash
# Clone
git clone https://github.com/yash2x/Shadow-Protocol.git
cd Shadow-Protocol

# Install dependencies
npm install

# Configure environment
cp .env.example .env.local
# Fill in your own keys (see .env.example for required variables)

# Start development server
npm run dev
```

### Environment Variables

See `.env.example` for the full list. You will need:

- Solana RPC URL (devnet or Helius endpoint)
- Supabase project URL and anon key
- Supabase service key (server-side only, for API routes)
- Agent URL (relayer endpoint)

> **Note:** Never commit `.env.local` or any file containing real keys.

### Running the Relayer Agent

```bash
cd agent
npm install
# Set environment variables:
export SUPABASE_URL=your-url
export SUPABASE_KEY=your-key
export SUPABASE_SERVICE_KEY=your-service-key
node index.js
```

---

## Deployment

The production instance runs on a VPS with:

- **systemd** for process management
- **Nginx** as reverse proxy with SSL (24h log rotation)
- **Let's Encrypt** for HTTPS certificates

```bash
npm run build
sudo systemctl start shadow-protocol
sudo systemctl start shadow-agent
```

---

## Roadmap

- [x] ZK mixer with Groth16 proofs
- [x] Username-based anonymous transfers
- [x] Multi-pool support (0.1 / 1 / 10 SOL)
- [x] Stealth addresses (Monero-style)
- [x] End-to-end encrypted messaging
- [x] Dead man switch vaults
- [x] Dynamic embedded wallet integration
- [x] Helius RPC integration
- [x] Web Audio sound design
- [x] Internal security audit — 14 findings resolved
- [x] Privacy audit & hardening — grade B+
- [x] Poisson-distributed timing obfuscation
- [x] No-logs policy & auto-cleanup
- [x] RPC proxy (IP privacy)
- [x] Dummy transaction noise generation
- [ ] Formal audit (OtterSec / Sec3)
- [ ] Token launch & tokenomics
- [ ] Decentralized relayer network
- [ ] Staking & governance
- [ ] Tor .onion mirror
- [ ] Mainnet deployment
- [ ] Mobile app (React Native)
- [ ] Cross-chain support

---

## Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/your-feature`
3. Commit with clear messages
4. Open a Pull Request

Please follow existing code conventions and update documentation for any new features.

---

## Acknowledgments

Inspired by Tornado Cash (privacy pools), Monero (stealth addresses), and Zcash (ZK-SNARKs). Built with Anchor, Circom, snarkjs, Dynamic, and Helius on Solana.

---

## License

MIT — see [LICENSE](LICENSE) for details.

---

## Disclaimer

This software is provided "as is" without warranty of any kind. Shadow Protocol is experimental software for educational and research purposes. Users assume all risks. The developers are not responsible for any loss of funds or privacy breaches arising from use of this software. Always use additional privacy tools (VPN/Tor) and fresh wallets for maximum anonymity.

---

<p align="center">
  <b>Shadow Protocol</b> — Privacy on Solana
  <br/>
  <a href="https://shadow-protocol.xyz">Website</a> · <a href="https://github.com/yash2x/Shadow-Protocol/issues">Issues</a> · <a href="https://github.com/yash2x/Shadow-Protocol/discussions">Discussions</a>
</p>
