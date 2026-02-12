# 🕶️ Shadow Protocol

> Private, anonymous, and untraceable cryptocurrency transactions on Solana using zero-knowledge proofs.

![Solana](https://img.shields.io/badge/Solana-Devnet-9945FF?style=for-the-badge&logo=solana)
![Next.js](https://img.shields.io/badge/Next.js-14-black?style=for-the-badge&logo=next.js)
![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?style=for-the-badge&logo=typescript&logoColor=white)
![License](https://img.shields.io/badge/License-MIT-green?style=for-the-badge)

**🌐 Live Demo:** [shadowprotocol.duckdns.org](https://shadowprotocol.duckdns.org)

---

## 🎯 What is Shadow Protocol?

Shadow Protocol is a privacy-preserving payment system on Solana that enables truly anonymous transfers through advanced cryptography. Send SOL to anyone without leaving a trace on the blockchain.

### Key Features

- **🔐 Zero-Knowledge Proofs** - Groth16 ZK-SNARKs ensure complete transaction privacy
- **👤 Username System** - Send to `@username` instead of long wallet addresses  
- **🌊 Anonymity Pools** - Your funds mix with others in shared pools (0.1, 1, 10 SOL)
- **⚡ Multi-Hop Relaying** - Random timing and routing break on-chain analysis
- **📱 Mobile-First UI** - Sleek cyberpunk design, works on any device

---

## 🏗️ Architecture
```
┌──────────────────┐
│   Web Frontend   │  Next.js 14 + TypeScript + Tailwind
│  (User Interface)│  - Wallet connection
└────────┬─────────┘  - ZK proof generation
         │            - Username management
         │
         ├─────────────────────┬──────────────────┐
         ▼                     ▼                  ▼
┌─────────────────┐   ┌─────────────────┐   ┌────────────┐
│    Supabase     │   │  Relayer Agent  │   │   Solana   │
│   (Database)    │   │   (Node.js)     │   │  Devnet    │
│                 │   │                 │   │            │
│ - User registry │   │ - Merkle proofs │   │ - Pools    │
│ - Pending txs   │   │ - Random delays │   │ - Verify   │
│ - Encrypted     │   │ - Withdrawal    │   │ - Nullifier│
│   notes         │   │   execution     │   │   tracking │
└─────────────────┘   └─────────────────┘   └────────────┘
```

---

## 🔬 How It Works

### 1️⃣ Deposit Phase
```
1. User deposits SOL to a pool (0.1, 1, or 10 SOL)
2. Generate commitment = Poseidon(secret, nullifier)
3. Commitment added to on-chain Merkle tree
4. User receives encrypted note
```

### 2️⃣ Transfer Phase
```
1. Sender enters recipient's @username
2. Encrypted note stored in database
3. Recipient receives notification
```

### 3️⃣ Withdrawal Phase
```
1. Recipient generates ZK proof of ownership
2. Proof submitted to relayer with 1-3 min random delay
3. Relayer verifies proof and executes withdrawal
4. Funds sent to recipient's wallet
5. Nullifier marked as spent (prevents double-spend)
```

**Result:** No on-chain link between sender and recipient! 🎉

---

## 🛠️ Technology Stack

| Layer | Technology |
|-------|-----------|
| **Smart Contract** | Rust, Anchor Framework |
| **ZK Circuits** | Circom, Groth16 |
| **Frontend** | Next.js 14, React, TypeScript |
| **Styling** | Tailwind CSS |
| **Wallet Integration** | Solana Wallet Adapter |
| **Relayer** | Node.js, Express |
| **Database** | Supabase (PostgreSQL) |
| **Cryptography** | circomlibjs (Poseidon), snarkjs |

---

## 🚀 Getting Started

### Prerequisites

- Node.js 18+
- Solana wallet (Phantom, Solflare, etc.)
- Some devnet SOL ([get from faucet](https://faucet.solana.com))

### Using the App

1. **Visit** [shadowprotocol.duckdns.org](https://shadowprotocol.duckdns.org)
2. **Connect** your Solana wallet
3. **Create** your username (@yourname)
4. **Send** SOL anonymously to any @username
5. **Receive** and withdraw with complete privacy

### For Developers
```bash
# Clone repository
git clone https://github.com/0x667TI/ShadowProtocol.git
cd ShadowProtocol

# Install dependencies
npm install

# Set up environment variables
cp .env.example .env.local
# Edit .env.local with your keys

# Run development server
npm run dev
```

**Environment Variables Required:**
```bash
# Solana
NEXT_PUBLIC_SOLANA_RPC_URL=https://api.devnet.solana.com
NEXT_PUBLIC_PROGRAM_ID=your_program_id

# Supabase
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key

# Relayer Agent
NEXT_PUBLIC_AGENT_URL=https://your-agent-url
```

---

## 🔐 Privacy & Security

### Privacy Guarantees

- ✅ **No sender-receiver link** on blockchain
- ✅ **ZK proofs** hide which deposit you own
- ✅ **Merkle trees** enable private membership proofs
- ✅ **Nullifiers** prevent double-spending
- ✅ **Random delays** (1-3 min) obfuscate timing
- ✅ **Username system** hides wallet addresses

### Security Model

**Trusted:**
- Smart contract code (open source)
- ZK circuit design (Groth16)
- Relayer for timing obfuscation

**Trustless:**
- Proofs verified on-chain
- No custody of funds
- Permissionless withdrawals

### ⚠️ Important Warnings

- 🧪 **Experimental software** - use at your own risk
- 🔬 **Not audited** - do not use with significant funds  
- 🧑‍💻 **Devnet only** - testnet environment
- 🎯 **Educational purposes** - proof of concept

---

## 📊 Technical Details

### Smart Contract

- **Language:** Rust (Anchor)
- **Network:** Solana Devnet
- **Pools:** 0.1 SOL, 1 SOL, 10 SOL
- **Merkle Depth:** 20 levels (1M+ capacity)

### ZK Circuit

- **System:** Groth16 (trusted setup)
- **Hash Function:** Poseidon (ZK-friendly)
- **Inputs:** secret, nullifier, Merkle path
- **Outputs:** root, nullifier hash
- **Constraints:** ~500-1000

### Relayer

- **Random Delay:** 60-180 seconds
- **Execution:** Automated via cron job (every 2s)
- **Gas Coverage:** Relayer pays transaction fees

---

## 🎨 Design Philosophy

Shadow Protocol embraces a **cyberpunk minimal aesthetic**:

- Black backgrounds with high contrast
- Neon green accent (`#00DC82`)
- Thin borders and geometric shapes
- Monospace fonts for addresses
- Clean, distraction-free interface

---

## 🗺️ Roadmap

- [x] Core protocol implementation
- [x] Username-based transfers
- [x] Multi-pool support (0.1, 1, 10 SOL)
- [x] Web interface
- [ ] Smart contract audit
- [ ] ZK circuit audit
- [ ] Mainnet deployment
- [ ] Decentralized relayer network
- [ ] Mobile app
- [ ] Cross-chain support

---

## 🤝 Contributing

Contributions are welcome! Here's how:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

### Development Guidelines

- Follow existing code style
- Add tests for new features
- Update documentation
- Keep commits atomic and well-described

---

## 📜 License

This project is licensed under the MIT License - see [LICENSE](LICENSE) file for details.

---

## 🙏 Acknowledgments

- **Tornado Cash** - Inspiration for privacy pools
- **Zcash** - ZK-SNARK cryptography
- **Solana Foundation** - High-performance blockchain
- **circom** - ZK circuit language
- **Anchor** - Solana development framework

---

## 📞 Support & Community

- 🐛 **Bug Reports:** [Open an issue](https://github.com/0x667TI/ShadowProtocol/issues)
- 💡 **Feature Requests:** [Submit a proposal](https://github.com/0x667TI/ShadowProtocol/discussions)
- 📧 **Contact:** Open a GitHub issue

---

## 📚 Additional Resources

- [Solana Documentation](https://docs.solana.com)
- [Anchor Book](https://book.anchor-lang.com)
- [Circom Documentation](https://docs.circom.io)
- [ZK-SNARKs Explained](https://z.cash/technology/zksnarks/)

---

## ⚖️ Disclaimer

**THIS SOFTWARE IS PROVIDED "AS IS" WITHOUT WARRANTY OF ANY KIND.**

Shadow Protocol is an experimental privacy protocol for educational purposes. Users assume all risks. The developers are not responsible for any loss of funds, privacy breaches, or legal issues arising from use of this software.

**Privacy is not guaranteed on testnet environments. Always withdraw to fresh wallets and use additional privacy tools (VPN/Tor) for maximum anonymity.**

---

<p align="center">
  <strong>Built with 🕶️ by 0x667TI</strong>
</p>

<p align="center">
  <a href="https://shadowprotocol.duckdns.org">Live Demo</a> •
  <a href="https://github.com/0x667TI/ShadowProtocol/issues">Report Bug</a> •
  <a href="https://github.com/0x667TI/ShadowProtocol/discussions">Request Feature</a>
</p>
