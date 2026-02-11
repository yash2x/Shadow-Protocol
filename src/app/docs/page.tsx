'use client';

import { useRouter } from 'next/navigation';

export default function DocsPage() {
  const router = useRouter();

  return (
    <div className="min-h-screen bg-black text-white">
      <div className="fixed inset-0 opacity-[0.02]">
        <div className="absolute inset-0" style={{
          backgroundImage: 'linear-gradient(#8B5CF6 1px, transparent 1px), linear-gradient(90deg, #8B5CF6 1px, transparent 1px)',
          backgroundSize: '40px 40px'
        }} />
      </div>

      <header className="relative border-b border-white/[0.06]">
        <div className="max-w-7xl mx-auto px-4 lg:px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3 cursor-pointer" onClick={() => router.push('/')}>
            <img src="/logo.png" alt="Shadow" className="w-6 h-6 object-contain" />
            <span className="text-[11px] font-bold tracking-[0.2em] uppercase">Shadow</span>
          </div>
          <div className="flex items-center gap-3">
            <a href="https://x.com/shadowp40792" target="_blank" rel="noopener noreferrer" className="w-8 h-8 flex items-center justify-center border border-white/[0.08] hover:bg-white/[0.03] transition-all">
              <svg className="w-3.5 h-3.5 text-white/60" fill="currentColor" viewBox="0 0 24 24"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" /></svg>
            </a>
            <a href="https://github.com/Shadowprtcl" target="_blank" rel="noopener noreferrer" className="w-8 h-8 flex items-center justify-center border border-white/[0.08] hover:bg-white/[0.03] transition-all">
              <svg className="w-3.5 h-3.5 text-white/60" fill="currentColor" viewBox="0 0 24 24"><path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" /></svg>
            </a>
            <button onClick={() => router.push('/main')} className="px-5 py-2 bg-[#8B5CF6] text-white text-[9px] tracking-[0.2em] uppercase font-bold hover:bg-[#7C3AED] transition-all">Launch App</button>
          </div>
        </div>
      </header>

      <main className="relative max-w-4xl mx-auto px-4 lg:px-6 py-12 lg:py-20">
        <div className="text-center mb-16">
          <h1 className="text-[24px] lg:text-[32px] font-bold tracking-[0.2em] uppercase mb-4">Documentation</h1>
          <p className="text-[10px] lg:text-[11px] tracking-[0.2em] uppercase text-white/30">Technical Overview of Shadow Protocol</p>
        </div>

        <div className="space-y-12">
          <section className="border border-white/[0.06] bg-[#050505] p-6 lg:p-8">
            <h2 className="text-[12px] lg:text-[14px] font-bold tracking-[0.2em] uppercase mb-4 text-[#8B5CF6]">Introduction</h2>
            <p className="text-[10px] lg:text-[11px] text-white/50 leading-relaxed mb-4">Shadow Protocol is a privacy-preserving payment system built on Solana. It enables users to send SOL anonymously using zero-knowledge proofs, making transactions untraceable on the blockchain.</p>
            <p className="text-[10px] lg:text-[11px] text-white/50 leading-relaxed">The protocol combines several cryptographic primitives including Poseidon hashes, Merkle trees, and Groth16 ZK-SNARKs to achieve maximum privacy while maintaining the speed and low costs of Solana.</p>
          </section>

          <section className="border border-white/[0.06] bg-[#050505] p-6 lg:p-8">
            <h2 className="text-[12px] lg:text-[14px] font-bold tracking-[0.2em] uppercase mb-4 text-[#8B5CF6]">Architecture</h2>
            <div className="space-y-6">
              <div>
                <h3 className="text-[10px] font-bold tracking-[0.15em] uppercase mb-2 text-white/80">Smart Contract (Solana Program)</h3>
                <p className="text-[9px] lg:text-[10px] text-white/40 leading-relaxed">The on-chain program manages deposit pools and withdrawal logic. Each pool corresponds to a fixed denomination (0.1, 1, or 10 SOL). Deposits generate cryptographic commitments stored in a Merkle tree structure.</p>
              </div>
              <div>
                <h3 className="text-[10px] font-bold tracking-[0.15em] uppercase mb-2 text-white/80">Relay Network</h3>
                <p className="text-[9px] lg:text-[10px] text-white/40 leading-relaxed">A decentralized network of relayers processes withdrawals. Relayers submit transactions on behalf of users, breaking the direct link between sender and recipient.</p>
              </div>
              <div>
                <h3 className="text-[10px] font-bold tracking-[0.15em] uppercase mb-2 text-white/80">ZK Proof System</h3>
                <p className="text-[9px] lg:text-[10px] text-white/40 leading-relaxed">Groth16 ZK-SNARKs enable users to prove ownership of a deposit without revealing which deposit is theirs. The circuit verifies Merkle tree membership and nullifier uniqueness.</p>
              </div>
            </div>
          </section>

          <section className="border border-white/[0.06] bg-[#050505] p-6 lg:p-8">
            <h2 className="text-[12px] lg:text-[14px] font-bold tracking-[0.2em] uppercase mb-4 text-[#8B5CF6]">Cryptographic Primitives</h2>
            <div className="grid md:grid-cols-2 gap-6">
              <div className="border border-white/[0.04] p-4">
                <div className="flex items-center gap-2 mb-3"><div className="w-2 h-2 bg-[#8B5CF6]/50" /><h3 className="text-[9px] font-bold tracking-[0.15em] uppercase text-white/80">Poseidon Hash</h3></div>
                <p className="text-[8px] lg:text-[9px] text-white/40 leading-relaxed">ZK-friendly hash function optimized for arithmetic circuits. Used for generating commitments and nullifier hashes.</p>
              </div>
              <div className="border border-white/[0.04] p-4">
                <div className="flex items-center gap-2 mb-3"><div className="w-2 h-2 bg-[#8B5CF6]/50" /><h3 className="text-[9px] font-bold tracking-[0.15em] uppercase text-white/80">Merkle Tree</h3></div>
                <p className="text-[8px] lg:text-[9px] text-white/40 leading-relaxed">20-level binary tree storing deposit commitments. Enables efficient membership proofs with O(log n) path verification.</p>
              </div>
              <div className="border border-white/[0.04] p-4">
                <div className="flex items-center gap-2 mb-3"><div className="w-2 h-2 bg-[#8B5CF6]/50" /><h3 className="text-[9px] font-bold tracking-[0.15em] uppercase text-white/80">Groth16 ZK-SNARK</h3></div>
                <p className="text-[8px] lg:text-[9px] text-white/40 leading-relaxed">Succinct proof system with constant-size proofs (~200 bytes). Provides complete privacy with efficient verification.</p>
              </div>
              <div className="border border-white/[0.04] p-4">
                <div className="flex items-center gap-2 mb-3"><div className="w-2 h-2 bg-[#8B5CF6]/50" /><h3 className="text-[9px] font-bold tracking-[0.15em] uppercase text-white/80">Nullifiers</h3></div>
                <p className="text-[8px] lg:text-[9px] text-white/40 leading-relaxed">Unique identifiers preventing double-spending. Derived from secret values, revealed during withdrawal without linking to deposits.</p>
              </div>
            </div>
          </section>

          <section className="border border-white/[0.06] bg-[#050505] p-6 lg:p-8">
            <h2 className="text-[12px] lg:text-[14px] font-bold tracking-[0.2em] uppercase mb-6 text-[#8B5CF6]">Protocol Flow</h2>
            <div className="space-y-6">
              <div className="flex gap-4">
                <div className="flex-shrink-0 w-10 h-10 border border-[#8B5CF6]/30 flex items-center justify-center"><span className="text-[12px] font-bold text-[#8B5CF6]">1</span></div>
                <div>
                  <h3 className="text-[10px] font-bold tracking-[0.15em] uppercase mb-2">Deposit</h3>
                  <p className="text-[9px] text-white/40 leading-relaxed">User generates random secret (s) and nullifier (n). Computes commitment C = Poseidon(s, n) and submits deposit with C to smart contract.</p>
                </div>
              </div>
              <div className="flex gap-4">
                <div className="flex-shrink-0 w-10 h-10 border border-[#8B5CF6]/30 flex items-center justify-center"><span className="text-[12px] font-bold text-[#8B5CF6]">2</span></div>
                <div>
                  <h3 className="text-[10px] font-bold tracking-[0.15em] uppercase mb-2">Merkle Insertion</h3>
                  <p className="text-[9px] text-white/40 leading-relaxed">Commitment inserted into Merkle tree. User receives note containing secret and nullifier for withdrawal.</p>
                </div>
              </div>
              <div className="flex gap-4">
                <div className="flex-shrink-0 w-10 h-10 border border-[#8B5CF6]/30 flex items-center justify-center"><span className="text-[12px] font-bold text-[#8B5CF6]">3</span></div>
                <div>
                  <h3 className="text-[10px] font-bold tracking-[0.15em] uppercase mb-2">Generate ZK Proof</h3>
                  <p className="text-[9px] text-white/40 leading-relaxed">User generates ZK proof demonstrating knowledge of secret/nullifier and Merkle tree membership.</p>
                </div>
              </div>
              <div className="flex gap-4">
                <div className="flex-shrink-0 w-10 h-10 border border-[#8B5CF6]/30 flex items-center justify-center"><span className="text-[12px] font-bold text-[#8B5CF6]">4</span></div>
                <div>
                  <h3 className="text-[10px] font-bold tracking-[0.15em] uppercase mb-2">Relay and Withdraw</h3>
                  <p className="text-[9px] text-white/40 leading-relaxed">Proof submitted to random relayer. After verification and delay, relayer executes withdrawal to recipient.</p>
                </div>
              </div>
            </div>
          </section>

          <section className="border border-white/[0.06] bg-[#050505] p-6 lg:p-8">
            <h2 className="text-[12px] lg:text-[14px] font-bold tracking-[0.2em] uppercase mb-4 text-[#8B5CF6]">Technical Specifications</h2>
            <div className="grid md:grid-cols-2 gap-4">
              <div className="flex justify-between items-center py-2 border-b border-white/[0.04]"><span className="text-[8px] tracking-[0.15em] uppercase text-white/30">Network</span><span className="text-[9px] font-bold text-white/60">Solana Devnet</span></div>
              <div className="flex justify-between items-center py-2 border-b border-white/[0.04]"><span className="text-[8px] tracking-[0.15em] uppercase text-white/30">Proof System</span><span className="text-[9px] font-bold text-white/60">Groth16</span></div>
              <div className="flex justify-between items-center py-2 border-b border-white/[0.04]"><span className="text-[8px] tracking-[0.15em] uppercase text-white/30">Hash Function</span><span className="text-[9px] font-bold text-white/60">Poseidon</span></div>
              <div className="flex justify-between items-center py-2 border-b border-white/[0.04]"><span className="text-[8px] tracking-[0.15em] uppercase text-white/30">Merkle Depth</span><span className="text-[9px] font-bold text-white/60">20 levels</span></div>
              <div className="flex justify-between items-center py-2 border-b border-white/[0.04]"><span className="text-[8px] tracking-[0.15em] uppercase text-white/30">Pool Sizes</span><span className="text-[9px] font-bold text-white/60">0.1, 1, 10 SOL</span></div>
              <div className="flex justify-between items-center py-2 border-b border-white/[0.04]"><span className="text-[8px] tracking-[0.15em] uppercase text-white/30">Relayers</span><span className="text-[9px] font-bold text-white/60">5 nodes</span></div>
              <div className="flex justify-between items-center py-2 border-b border-white/[0.04]"><span className="text-[8px] tracking-[0.15em] uppercase text-white/30">Delay Range</span><span className="text-[9px] font-bold text-white/60">30s - 120s</span></div>
              <div className="flex justify-between items-center py-2 border-b border-white/[0.04]"><span className="text-[8px] tracking-[0.15em] uppercase text-white/30">Circuit</span><span className="text-[9px] font-bold text-white/60">Circom 2.0</span></div>
            </div>
          </section>
        </div>

        <div className="text-center mt-16">
          <button onClick={() => router.push('/')} className="px-8 py-3 border border-white/[0.08] text-[9px] tracking-[0.2em] uppercase font-bold hover:bg-white/[0.03] transition-all">Back to Home</button>
        </div>
      </main>

      <footer className="relative border-t border-white/[0.06] mt-12">
        <div className="max-w-7xl mx-auto px-4 lg:px-6 py-6">
          <div className="flex items-center justify-center gap-2">
            <img src="/logo.png" alt="Shadow" className="w-4 h-4 object-contain opacity-50" />
            <span className="text-[8px] tracking-[0.2em] uppercase text-white/25">Shadow Protocol 2025</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
