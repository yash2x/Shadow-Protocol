'use client';

import { useRouter } from 'next/navigation';
import { useState, useEffect } from 'react';
import Image from 'next/image';
import AnimatedBackground from '@/components/AnimatedBackground';

export default function DocsPage() {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) return null;

  return (
    <div className="text-[#1a1a1a] relative flex flex-col min-h-screen overflow-x-hidden bg-[#dddcd5]">
      <AnimatedBackground />

      {/* Header Content - Exact match to Homepage */}
      <header className="relative z-50 flex items-center px-6 lg:px-4 md:px-6 lg:px-4 md:px-6 lg:px-10 py-3 w-full border-b border-[#0a0a0a] bg-[#0a0a0a] gap-10">
        <div className="flex items-center">
          <div className="flex items-center gap-4 opacity-90 hover:opacity-100 transition-opacity cursor-pointer" onClick={() => router.push('/')}>
            <div className="relative w-32 h-32 -ml-2 -my-6">
              <Image
                src="/logox.png"
                alt="Shadow Protocol Logo"
                fill
                className="object-contain drop-shadow-[0_0_10px_rgba(176,38,255,0.4)]"
                priority
              />
            </div>
          </div>
        </div>
        <nav className="hidden md:flex items-center gap-10">
          <a href="/" className="text-xs font-hud tracking-[0.2em] text-[#a1a39b] hover:text-[#b026ff] transition-colors">PLATFORM +</a>
          <a href="/main" className="text-xs font-hud tracking-[0.2em] text-[#a1a39b] hover:text-[#b026ff] transition-colors">APP +</a>
          <a href="/deadman" className="text-xs font-hud tracking-[0.2em] text-[#a1a39b] hover:text-[#b026ff] transition-colors">DEAD +</a>
          <a href="/docs" className="text-xs font-hud tracking-[0.2em] font-semibold text-white hover:text-[#b026ff] transition-colors">DOC +</a>
        </nav>
        <button onClick={() => setMenuOpen(!menuOpen)} className="md:hidden ml-auto w-10 h-10 flex items-center justify-center text-white">
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            {menuOpen ? <path strokeLinecap="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /> : <path strokeLinecap="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />}
          </svg>
        </button>
      </header>

      {/* Mobile Menu */}
      {menuOpen && (
        <div className="md:hidden relative z-50 bg-[#0a0a0a] border-b border-[#333] p-6">
          <nav className="flex flex-col gap-6">
            <a href="/" className="text-xs font-hud tracking-[0.2em] text-[#a1a39b]">PLATFORM +</a>
            <a href="/main" className="text-xs font-hud tracking-[0.2em] text-[#a1a39b]">APP +</a>
            <a href="/deadman" className="text-xs font-hud tracking-[0.2em] text-[#a1a39b]">DEAD +</a>
            <a href="/docs" className="text-xs font-hud tracking-[0.2em] font-semibold text-white">DOC +</a>
          </nav>
        </div>
      )}

      {/* Main Container */}
      <main className="relative z-40 max-w-5xl mx-auto px-6 py-16 lg:py-24 w-full">

        {/* HERO TITLE */}
        <div className="mb-16">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 border border-[#c3c5bc] bg-white/60 mb-6 clip-angled-tl relative group shadow-sm">
            <div className="w-1.5 h-1.5 bg-[#b026ff] absolute top-1/2 -translate-y-1/2 left-3" />
            <span className="text-[10px] font-mono tracking-[0.25em] font-bold text-[#666] ml-4 uppercase">Technical Overview</span>
          </div>
          <h1 className="text-2xl md:text-2xl md:text-5xl lg:text-6xl font-hud font-bold uppercase break-words mb-4 text-[#111] break-words">
            DOCUMENTATION
          </h1>
          <p className="text-sm font-semibold tracking-[0.2em] uppercase text-[#888]">Shadow Protocol — Zero Knowledge Privacy on Solana</p>
        </div>

        <div className="space-y-10">

          {/* INTRODUCTION */}
          <section className="bg-white border border-[#c3c5bc] p-8 lg:p-12 shadow-[10px_10px_30px_rgba(0,0,0,0.05)] clip-angled-br relative group">
            <div className="absolute top-6 left-6 text-[#a1a39b] font-bold tracking-widest text-[14px]">+</div>

            <div className="flex items-center gap-4 mb-8 ml-6">
              <div className="w-10 h-10 bg-[#e2e4dd] border border-[#c3c5bc] flex items-center justify-center clip-angled-br">
                <svg className="w-5 h-5 text-[#b026ff]" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="square" d="M12 6v12m0-12a4 4 0 10-8 0v12a4 4 0 108 0m0-12a4 4 0 118 0v12a4 4 0 11-8 0" />
                </svg>
              </div>
              <h2 className="text-xl md:text-2xl font-hud uppercase break-words tracking-[0.1em] text-[#111]">Introduction</h2>
            </div>

            <div className="ml-6 space-y-4 text-[14px] text-[#444] font-medium leading-relaxed max-w-3xl">
              <p>
                Shadow Protocol is a privacy-preserving payment system built on Solana. It enables users to send SOL anonymously using zero-knowledge proofs, making transactions untraceable on the blockchain.
              </p>
              <p>
                The protocol combines several cryptographic primitives including Poseidon hashes, Merkle trees, and Groth16 ZK-SNARKs to achieve maximum privacy while maintaining the speed and low costs of Solana.
              </p>
            </div>
          </section>

          {/* ARCHITECTURE */}
          <section className="bg-[#f0f1ed] border border-[#c3c5bc] p-8 lg:p-12 shadow-inner relative">
            <div className="absolute top-6 right-6 text-[#c3c5bc] font-bold tracking-widest text-[14px]">++</div>

            <div className="flex items-center gap-4 mb-8">
              <div className="w-1 h-8 bg-[#111]" />
              <h2 className="text-xl md:text-2xl font-hud uppercase break-words tracking-[0.1em] text-[#111]">Architecture</h2>
            </div>

            <div className="space-y-6">
              {[
                { title: 'Smart Contract (Solana Program)', desc: 'The on-chain program manages deposit pools and withdrawal logic. Each pool corresponds to a fixed denomination (0.1, 1, or 10 SOL). Deposits generate cryptographic commitments stored in a Merkle tree structure.' },
                { title: 'Relay Network', desc: 'A decentralized network of relayers processes withdrawals. Relayers submit transactions on behalf of users, breaking the direct link between sender and recipient.' },
                { title: 'ZK Proof System', desc: 'Groth16 ZK-SNARKs enable users to prove ownership of a deposit without revealing which deposit is theirs. The circuit verifies Merkle tree membership and nullifier uniqueness.' },
              ].map((item, i) => (
                <div key={i} className="flex gap-6 p-6 bg-white border border-[#dddcd5] shadow-sm hover:border-[#b026ff]/30 transition-colors">
                  <div className="text-3xl font-hud text-[#e2e4dd] leading-none pt-1">0{i + 1}</div>
                  <div>
                    <h3 className="text-[13px] font-bold tracking-[0.15em] uppercase mb-2 text-[#111]">{item.title}</h3>
                    <p className="text-[13px] text-[#666] leading-relaxed font-medium">{item.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* CRYPTOGRAPHIC PRIMITIVES */}
          <section className="bg-white border border-[#c3c5bc] p-8 lg:p-12 shadow-[10px_10px_30px_rgba(0,0,0,0.05)] relative">
            <div className="flex items-center gap-4 mb-8">
              <div className="w-10 h-10 bg-[#e2e4dd] border border-[#c3c5bc] flex items-center justify-center rounded-sm">
                <svg className="w-5 h-5 text-[#111]" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="square" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
              </div>
              <h2 className="text-xl md:text-2xl font-hud uppercase break-words tracking-[0.1em] text-[#111]">Primitives</h2>
            </div>

            <div className="grid md:grid-cols-2 gap-6">
              {[
                { title: 'Poseidon Hash', desc: 'ZK-friendly hash function optimized for arithmetic circuits. Used for generating commitments and nullifier hashes.' },
                { title: 'Merkle Tree', desc: '20-level binary tree storing deposit commitments. Enables efficient membership proofs with O(log n) path verification.' },
                { title: 'Groth16 ZK-SNARK', desc: 'Succinct proof system with constant-size proofs (~200 bytes). Provides complete privacy with efficient verification.' },
                { title: 'Nullifiers', desc: 'Unique identifiers preventing double-spending. Derived from secret values, revealed during withdrawal without linking to deposits.' },
              ].map((item, i) => (
                <div key={i} className="p-6 border border-[#e2e4dd] bg-[#f8f9f7] hover:bg-white transition-all group relative overflow-hidden">
                  <div className="absolute top-0 left-0 w-1 h-full bg-[#111] transform -translate-x-full group-hover:translate-x-0 transition-transform" />
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-1.5 h-1.5 bg-[#b026ff]" />
                    <h3 className="text-[12px] font-bold tracking-[0.15em] uppercase text-[#111]">{item.title}</h3>
                  </div>
                  <p className="text-[13px] text-[#666] leading-relaxed font-medium">{item.desc}</p>
                </div>
              ))}
            </div>
          </section>

          {/* PROTOCOL FLOW */}
          <section className="bg-white border-y lg:border border-[#c3c5bc] py-12 px-6 lg:p-12 relative overflow-hidden">
            {/* Background wireframe accent */}
            <div className="absolute top-0 right-0 w-64 h-64 border-[40px] border-[#f0f1ed] rounded-full translate-x-1/3 -translate-y-1/3 opacity-50 pointer-events-none" />

            <div className="flex items-center gap-4 mb-10 relative z-10">
              <h2 className="text-xl md:text-2xl font-hud uppercase break-words tracking-[0.1em] text-[#111]">Flow Data</h2>
            </div>

            <div className="relative pl-6 lg:pl-10 z-10">
              {/* Vertical line connecting steps */}
              <div className="absolute left-[11px] lg:left-[27px] top-2 bottom-6 w-0.5 bg-[#e2e4dd]" />

              <div className="space-y-8">
                {[
                  { step: '1', title: 'Deposit Phase', desc: 'User generates random secret (s) and nullifier (n). Computes commitment C = Poseidon(s, n) and submits deposit with C to smart contract.' },
                  { step: '2', title: 'Merkle Insertion', desc: 'Commitment inserted into Merkle tree. User receives encrypted note containing secret and nullifier for withdrawal routing.' },
                  { step: '3', title: 'ZK Proof Gen', desc: 'User client generates ZK proof demonstrating knowledge of secret/nullifier and Merkle tree membership without disclosing specific leaves.' },
                  { step: '4', title: 'Relay & Burn', desc: 'Proof submitted to random relayer. After verification and time-delay, relayer executes anonymous transfer to the designated recipient.' },
                ].map((item, i) => (
                  <div key={i} className="relative flex gap-6 lg:gap-8 items-start">
                    {/* Step indicator node */}
                    <div className="absolute left-[-29px] lg:left-[-13px] top-1 w-4 h-4 rounded-none bg-white border-2 border-[#111] flex items-center justify-center z-10">
                      <div className="w-1 h-1 bg-[#111]" />
                    </div>
                    <div>
                      <h3 className="text-[13px] font-bold tracking-[0.1em] uppercase mb-2 text-[#111] flex items-center gap-3">
                        <span className="text-[#b026ff] font-hud text-lg">0{item.step}</span> {item.title}
                      </h3>
                      <p className="text-[13px] text-[#666] leading-relaxed font-medium max-w-2xl">{item.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>

          {/* TWO COLUMN GRID FOR SPECS AND FEATURES */}
          <div className="grid lg:grid-cols-2 gap-10">

            {/* TECHNICAL SPECIFICATIONS */}
            <section className="bg-white border border-[#c3c5bc] p-8 shadow-sm">
              <h2 className="text-xl font-hud uppercase tracking-[0.1em] text-[#111] mb-6 border-b border-[#e2e4dd] pb-4">Tech Specs</h2>
              <div className="space-y-3">
                {[
                  { label: 'Network', val: 'Solana Devnet' },
                  { label: 'Proof System', val: 'Groth16' },
                  { label: 'Hash Function', val: 'Poseidon' },
                  { label: 'Merkle Depth', val: '20 levels' },
                  { label: 'Pool Sizes', val: '0.1, 1, 10 SOL' },
                  { label: 'Relayers', val: '5 nodes' },
                  { label: 'Circuit', val: 'Circom 2.0' },
                ].map((item, i) => (
                  <div key={i} className="flex justify-between items-center py-2 border-b border-[#f0f1ed] last:border-0 hover:bg-[#f8f9f7] px-2 transition-colors">
                    <span className="text-[11px] font-mono tracking-[0.1em] text-[#888]">{item.label}</span>
                    <span className="text-[12px] font-bold text-[#111]">{item.val}</span>
                  </div>
                ))}
              </div>
            </section>

            {/* ENCRYPTED MESSAGES */}
            <section className="bg-white border border-t-[4px] border-[#c3c5bc] border-t-[#38BDF8] p-8 shadow-[10px_10px_30px_rgba(0,0,0,0.02)]">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-hud uppercase tracking-[0.1em] text-[#111]">Encrypted Messages</h2>
                <span className="px-3 py-1 bg-[#38BDF8]/10 text-[#0284c7] font-bold text-[10px] tracking-widest uppercase border border-[#38BDF8]/20 hidden sm:block">
                  Module Online
                </span>
              </div>
              <p className="text-[13px] text-[#666] font-medium leading-relaxed mb-6">
                Shadow Protocol introduces end-to-end encrypted messaging attached to private transfers. When sending SOL to a @username, the sender can optionally include a private note that only the recipient can decrypt.
              </p>
              <div className="space-y-4">
                {[
                  { label: 'Algorithm', val: 'NaCl Box (Curve25519 + XSalsa20 + Poly1305)' },
                  { label: 'Key Setup', val: 'Secret key stays in localStorage. Public key in DB.' },
                  { label: 'Flow', val: 'Client encrypts with Recipient PubKey. DB stores ciphertext. Client decrypts locally.' },
                ].map((item, i) => (
                  <div key={i} className="bg-[#f0f1ed] p-3 border-l-2 border-[#38BDF8]">
                    <h4 className="text-[10px] font-bold tracking-[0.15em] uppercase text-[#111] mb-1">{item.label}</h4>
                    <p className="text-[12px] text-[#666] font-medium">{item.val}</p>
                  </div>
                ))}
              </div>
            </section>

          </div>

          {/* DEAD MAN'S SWITCH */}
          <section className="bg-[#111] text-white border border-[#333] p-8 lg:p-12 relative overflow-hidden clip-angled-tl">
            {/* Warning stripes */}
            <div className="absolute top-0 left-0 w-full h-2 bg-[repeating-linear-gradient(45deg,#ff3333,#ff3333_10px,#000_10px,#000_20px)]" />

            <div className="absolute top-8 right-8 text-[#ff3333] font-bold tracking-widest text-[14px]">!!!</div>

            <h2 className="text-xl md:text-2xl font-hud uppercase break-words tracking-[0.1em] text-[#ff3333] mb-4 mt-2">Dead Man's Switch</h2>

            <p className="text-[14px] text-white/70 leading-relaxed mb-8 max-w-3xl">
              An autonomous vault system that triggers anonymous SOL transfers if the owner fails to check in within a set interval. Combines time-locked logic with Shadow ZK routing for untraceable inheritance or failsafe executions.
            </p>

            <div className="grid md:grid-cols-2 gap-6">
              {[
                { title: 'Trigger Logic', desc: 'Owner defines check-in intervals (7d, 30d, 90d). Missing a check-in allows the autonomous relayer agent to fire the pre-signed ZK transaction.' },
                { title: 'Private Routing', desc: 'Executions are routed via the Shadow layer. Observers cannot trace the origin vault of a received payload.' },
              ].map((item, i) => (
                <div key={i} className="border border-white/10 p-5 bg-white/[0.02]">
                  <p className="text-[12px] font-bold tracking-[0.15em] uppercase text-white mb-2">{item.title}</p>
                  <p className="text-[13px] text-white/50 leading-relaxed">{item.desc}</p>
                </div>
              ))}
            </div>
          </section>

        </div>

        {/* BACK BUTTON */}
        <div className="mt-20 flex justify-center pb-20">
          <button onClick={() => router.push('/')}
            className="flex items-center gap-4 px-8 py-4 bg-white border border-[#c3c5bc] text-[#111] text-[13px] tracking-[0.2em] font-bold uppercase hover:bg-[#111] hover:text-white transition-colors shadow-sm">
            <span className="text-xl leading-none">«</span>
            RETURN TO HUB
          </button>
        </div>
      </main>

    </div>
  );
}
