# 🌑 Shadow Protocol

Private, anonymous, and untraceable cryptocurrency transactions on Solana using zero-knowledge proofs.

## Features

- 🔐 **Zero-Knowledge Proofs** - Groth16 ZK-SNARKs for complete privacy
- 🔀 **Multi-Hop Relaying** - Random routing breaks on-chain analysis
- 👥 **Anonymity Sets** - Shared pools maximize privacy guarantees
- ⚡ **Fast & Cheap** - Built on Solana for speed and low fees

## Tech Stack

- **Frontend**: Next.js 15, React, TailwindCSS
- **Blockchain**: Solana (Anchor framework)
- **Privacy**: Circom circuits, SnarkJS
- **Backend**: Node.js agent with relay network

## Getting Started
```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

## Architecture

1. **Deposit** - Funds enter shared anonymity pool
2. **ZK Proof** - Prove ownership without revealing identity
3. **Relay** - Withdraw via multi-hop relay network

## Security

⚠️ **Experimental software** - Use at your own risk. Not audited.

## License

MIT
