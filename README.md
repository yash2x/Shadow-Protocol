# Shadow Protocol

**Privacy-first transaction layer on Solana — Anonymous transfers, encrypted messaging, stealth addresses & dead man switch.**

[![Website](https://img.shields.io/badge/Website-shadow--protocol.xyz-00DC82?style=flat-square)](https://shadow-protocol.xyz)
[![Solana](https://img.shields.io/badge/Solana-Devnet-9945FF?style=flat-square&logo=solana)](https://solana.com)
[![Audit](https://img.shields.io/badge/Audit-Passed-00DC82?style=flat-square&logo=shield)](audits/2026-03-08-internal-review.md)
[![License](https://img.shields.io/badge/License-MIT-white?style=flat-square)](LICENSE)

---

## Overview

Shadow Protocol is a privacy-preserving payment layer built on Solana. It combines zero-knowledge proofs, stealth addresses, end-to-end encrypted messaging, and a dead man switch mechanism to provide comprehensive financial privacy on a public blockchain.

The protocol enables users to deposit SOL into anonymity pools, transfer ownership privately via encrypted notes, and withdraw funds to any wallet — with no on-chain link between sender and recipient.

**Network:** Solana Devnet  
**Status:** Beta — internally audited, all findings resolved

---

## Security Audit

Shadow Protocol has undergone an internal security review covering the relayer agent, Merkle tree implementation, ZK proof verification, API routes, client-side cryptography, and infrastructure configuration.

**Results:** 14 findings identified and resolved — 2 Critical, 3 High, 5 Medium, 4 Low. Full report available in [`audits/2026-03-08-internal-review.md`](audits/2026-03-08-internal-review.md).

Key security measures implemented:
- Persistent nullifier tracking (anti-double-spend across restarts)
- Rate limiting on all sensitive endpoints
- CORS restricted to production domain
- Input validation on all deposit commitments (field range, zero check, duplicate detection)
- Transaction confirmation timeouts with retry logic
- Relayer balance verification before withdrawal execution
- Atomic file writes for state persistence
- Wallet signature verification on stealth key registration

> A formal audit by a specialized firm (OtterSec, Sec3) is planned before mainnet deployment.

---

## Core Features

### Anonymous Transfers (ZK Mixer)
Deposit SOL into shared anonymity pools (0.1 / 1 / 10 SOL). Withdrawals use Groth16 ZK-SNARKs to prove ownership of a deposit without revealing which one. A relayer network executes withdrawals with randomized 60-180s delays to break timing correlation.

### Stealth Addresses
Inspired by Monero's stealth address scheme. Each user generates a stealth meta-key (scan + spend keypairs). Senders derive one-time addresses from the recipient's public meta-key using ECDH — only the recipient can detect and spend incoming payments. Implemented with `tweetnacl` (X25519 + XSalsa20-Poly1305).

### End-to-End Encrypted Messaging
Users can exchange encrypted messages tied to transactions. Messages are encrypted client-side using NaCl `box` (X25519-XSalsa20-Poly1305) before being stored — the server never sees plaintext. Keypairs are derived per-user and stored locally.

### Dead Man Switch
A configurable vault system that automatically releases funds to designated recipients if the owner fails to check in within a set time window. Trigger mechanism runs server-side via the relayer agent (checked every 10 minutes). Designed for inheritance planning and emergency fund distribution.

### Embedded Wallet (Dynamic)
Wallet creation and connection handled via [Dynamic](https://dynamic.xyz) SDK — supports embedded wallets (email/social login) alongside traditional Solana wallets (Phantom, Solflare, Backpack). Reduces onboarding friction for non-crypto-native users.

### Helius RPC Integration
Solana RPC calls routed through [Helius](https://helius.dev) for enhanced reliability, rate limits, and access to enriched transaction data on devnet.

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
│     Supabase         │   │     Relayer Agent (Node.js)   │
│                      │   │                               │
│  PostgreSQL:         │   │  - Processes pending          │
│  · User registry     │   │    withdrawals (cron 5s)      │
│  · Encrypted notes   │   │  - Merkle proof generation    │
│  · Stealth meta-keys │   │  - Random delay (30-120s)     │
│  · Dead man vaults   │   │  - Dead man switch (10 min)   │
│  · Notifications     │   │  - Multi-hop relaying         │
│                      │   │  - 5 relayer wallets          │
│                      │   │  - Rate limiting              │
│                      │   │  - Nullifier persistence      │
└──────────────────────┘   └──────────────┬────────────────┘
                                          │
                                          ▼
                           ┌──────────────────────────────┐
                           │     Solana Devnet             │
                           │                               │
                           │  Anchor program:              │
                           │  · 3 anonymity pools          │
                           │    (0.1 / 1 / 10 SOL)        │
                           │  · Merkle tree (depth 20)     │
                           │  · On-chain ZK verification   │
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
| RPC | Helius | Enhanced Solana RPC |
| Encryption | tweetnacl · nacl-util | Stealth addresses, E2E messaging (X25519) |
| Relayer | Node.js · express-rate-limit | Automated withdrawals, dead man trigger |
| Database | Supabase (PostgreSQL) | User data, encrypted notes, vaults |
| Hosting | VPS · systemd · Nginx | Production deployment |

---

## Privacy Model

### What is hidden
- Link between deposit and withdrawal addresses
- Which deposit belongs to which user (ZK proof)
- Transaction timing (randomized relay delays)
- Message content (E2E encrypted, server sees ciphertext only)
- Receiving addresses (stealth address derivation)

### What is visible
- Deposit and withdrawal events on-chain (amounts are fixed per pool)
- That someone is using Shadow Protocol
- Pool balances

### Trust assumptions
- Smart contract code is open source and verifiable
- ZK proofs are verified on-chain (trustless)
- Relayer is trusted for timing obfuscation (not for fund custody)
- Supabase stores only encrypted/hashed data

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
│   │       ├── stealth/register/ # Stealth meta-key registration
│   │       └── deadman/trigger/  # Dead man switch trigger endpoint
│   ├── components/
│   │   ├── WalletContextProvider.tsx
│   │   ├── AnimatedBackground.tsx
│   │   ├── HowItWorks.tsx
│   │   └── SolanaCoin3D.tsx
│   ├── lib/supabase.ts           # Supabase client
│   ├── config.ts                 # Program IDs, pool addresses
│   └── providers.tsx             # Dynamic SDK provider
├── agent/
│   ├── index.js                  # Relayer agent v7.0.0
│   ├── merkle.js                 # Merkle tree operations
│   ├── fund-relayers.js          # Utility: fund relayer wallets
│   └── generate-wallets.js       # Utility: generate relayer keypairs
├── audits/
│   └── 2026-03-08-internal-review.md  # Security audit report
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

> **Note:** Never commit `.env.local` or any file containing real keys. The `.gitignore` is configured to exclude all env files.

### Running the Relayer Agent

```bash
cd agent
npm install
node index.js
```

The agent requires `SUPABASE_URL`, `SUPABASE_KEY`, and `SUPABASE_SERVICE_KEY` environment variables. It processes pending withdrawals every 5 seconds and checks dead man switch vaults every 10 minutes.

---

## Deployment

The production instance runs on a VPS with:

- **systemd** for process management
- **Nginx** as reverse proxy with SSL
- **Let's Encrypt** for HTTPS certificates

```bash
# Build
npm run build

# Start with systemd
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
- [x] Internal security audit — all findings resolved
- [ ] Formal audit (OtterSec / Sec3)
- [ ] Token launch & tokenomics
- [ ] Decentralized relayer network
- [ ] Staking & governance
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
