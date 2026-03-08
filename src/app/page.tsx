'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import Image from 'next/image';
import AnimatedBackground from '@/components/AnimatedBackground';

export default function HomePage() {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  const handleLaunch = () => {
    window.location.href = '/main';
  };

  useEffect(() => {
    setMounted(true);

    // Scroll animation observer
    const observerCallback: IntersectionObserverCallback = (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('reveal-visible');
        }
      });
    };

    const observerOptions = {
      threshold: 0.1,
      rootMargin: '0px 0px -50px 0px'
    };

    const observer = new IntersectionObserver(observerCallback, observerOptions);

    setTimeout(() => {
      const revealElements = document.querySelectorAll('.reveal');
      revealElements.forEach((el) => observer.observe(el));
    }, 100);

    return () => observer.disconnect();
  }, []);

  if (!mounted) return null;

  return (
    <div className="text-[#1a1a1a] relative flex flex-col min-h-screen bg-[#dddcd5]">
      <AnimatedBackground />
      {/* Header Content */}
      <header className="relative z-30 flex items-center px-4 md:px-6 lg:px-10 py-3 w-full border-b border-[#0a0a0a] bg-[#0a0a0a] gap-10">
        <div className="flex items-center">
          {/* User's custom logo - updated to fit the avatar appropriately */}
          <div className="flex items-center gap-4 opacity-90 hover:opacity-100 transition-opacity cursor-pointer" onClick={() => window.location.href = '/'}>
            {/* Logo vertically centered with the navbar */}
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
          <a href="/" className="text-xs font-hud tracking-[0.2em] font-semibold text-white hover:text-[#b026ff] transition-colors">PLATFORM +</a>
          <a href="/main" className="text-xs font-hud tracking-[0.2em] text-[#a1a39b] hover:text-[#b026ff] transition-colors">APP +</a>
          <a href="/deadman" className="text-xs font-hud tracking-[0.2em] text-[#a1a39b] hover:text-[#b026ff] transition-colors">DEAD +</a>
          <a href="/docs" className="text-xs font-hud tracking-[0.2em] text-[#a1a39b] hover:text-[#b026ff] transition-colors">DOC +</a>
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
            <a href="/" className="text-xs font-hud tracking-[0.2em] font-semibold text-white">PLATFORM +</a>
            <a href="/main" className="text-xs font-hud tracking-[0.2em] text-[#a1a39b]">APP +</a>
            <a href="/deadman" className="text-xs font-hud tracking-[0.2em] text-[#a1a39b]">DEAD +</a>
            <a href="/docs" className="text-xs font-hud tracking-[0.2em] text-[#a1a39b]">DOC +</a>
          </nav>
        </div>
      )}

      {/* Hero Section */}
      <main className="relative z-40 flex flex-col lg:flex-row items-stretch gap-8 mb-16 lg:mb-32 px-4 mt-6 lg:mt-16 max-w-[1600px] mx-auto w-full">

        {/* Left Side: Descriptions and Title Box */}
        <div className="relative flex-1 flex flex-col justify-between pt-6 lg:pt-12 pb-0 lg:pr-10 z-20">

          {/* Top Description Area */}
          <div className="max-w-md ml-0 lg:ml-12 relative z-20 px-2 lg:px-0">
            <div className="text-[11px] font-bold text-[#a1a39b] tracking-widest mb-4">+++</div>
            <p className="text-sm font-semibold text-[#666] uppercase tracking-wide leading-relaxed text-left">
              IN WEB3, YOUR ADDRESS IS YOUR IDENTITY &mdash; BUT WHAT IF YOUR PRESENCE HAD A SHIELD? SEND SOL ANONYMOUSLY USING ZK-SNARKS.
            </p>
          </div>

          <div className="hidden lg:block flex-grow min-h-[200px]"></div>

          {/* Bottom Left Title Box (White Overlay) */}
          <div className="bg-white p-6 lg:p-12 relative z-30 clip-angled-tl mr-auto w-full max-w-[550px] shadow-[10px_10px_30px_rgba(0,0,0,0.05)] border-t border-r border-[#eee] mt-6 lg:mt-0">
            {/* Small top-left cross element inside box */}
            <div className="absolute top-8 left-8 text-[#a1a39b] font-bold tracking-widest text-[14px]">+</div>

            <h1 className="text-4xl lg:text-[2.8rem] font-hud leading-[1.1] mb-2 uppercase text-[#111]">
              SHADOW<br />PROTOCOL
            </h1>

            <div className="flex flex-col sm:flex-row sm:items-center justify-between mt-8 gap-4">
              <span className="text-xs font-bold tracking-widest text-[#a1a39b] uppercase">Private Layer</span>
              <button onClick={handleLaunch} className="bg-[#b026ff] hover:bg-[#8e19d6] text-white text-sm font-hud py-4 px-8 clip-angled-br transition-colors flex items-center justify-center gap-3 w-full sm:w-auto hover:shadow-lg">
                START NOW
                <span className="text-lg leading-none font-bold">»</span>
              </button>
            </div>
          </div>
        </div>

        {/* Right Side: Robot Image in Card */}
        <div className="relative w-full lg:w-[45vw] z-50 lg:-mt-10">
          {/* Card Container - Added group hover for the robot animation and overflow-hidden to prevent bottom leak */}
          <div className="relative lg:absolute lg:top-16 lg:bottom-0 lg:right-0 w-full lg:w-[85%] bg-[#e2e4dd]/50 backdrop-blur-md border border-[#c3c5bc] rounded-2xl lg:rounded-[40px] shadow-[10px_10px_30px_rgba(0,0,0,0.05)] group overflow-hidden min-h-[350px] lg:min-h-0">

            <div className="absolute top-8 left-8 text-[#a1a39b] font-bold tracking-widest text-[14px] z-10">+</div>
            <div className="absolute bottom-8 right-8 text-[#a1a39b] font-bold tracking-widest text-[14px] z-10">+</div>

            {/* Vertical text */}
            <div className="absolute top-1/2 left-8 -translate-y-1/2 text-[10px] font-mono tracking-widest text-[#a1a39b] -rotate-90 origin-left uppercase z-10">
              SYS_UNIT_01
            </div>

            {/* Robot Image enlarged to touch top of card and react to card hover */}
            <div className="absolute bottom-0 left-0 right-0 lg:left-[-15%] lg:right-[-15%] top-0 z-0 pointer-events-none transition-transform duration-500 ease-out group-hover:scale-110">
              <Image
                src="/xrobot.png"
                alt="Futuristic Robot Render"
                fill
                quality={100}
                unoptimized
                style={{ objectFit: 'cover', objectPosition: 'center top' }}
                className="mix-blend-multiply"
                priority
              />
            </div>
          </div>
        </div>
      </main>

      {/* Technical Features Panel */}
      <div className="max-w-7xl mx-auto px-6 py-12 relative z-20">
        <div className="w-full h-[1px] bg-[#c3c5bc] mb-12" />
        <h2 className="text-sm font-hud tracking-[0.3em] font-bold text-[#b026ff] uppercase mb-12">SYSTEM_CAPABILITIES_</h2>
        <div className="grid md:grid-cols-3 gap-0 border border-[#c3c5bc]">
          {[
            { title: 'ZK PROOFS', desc: 'Groth16 ZK-SNARKs ensure complete transaction privacy. Prove ownership without revealing variables.', icon: (<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="square" strokeLinejoin="miter" strokeWidth={1.5} d="M12 15v2m-6 4h12v-8H6v6zM22 7H2v4h20V7z" /></svg>) },
            { title: 'MULTI-HOP RELAY', desc: 'Randomized obfuscation routing through discrete relayers instantly breaks on-chain topology.', icon: (<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="square" strokeLinejoin="miter" strokeWidth={1.5} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>) },
            { title: 'STEALTH NET', desc: 'One-time receiver destinations utilizing high-entropy ECDH. Complete recipient cloaking.', icon: (<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="square" strokeLinejoin="miter" strokeWidth={1.5} d="M8 11V7a4 4 0 118 0v4m-6 4h12v6H6v-6z" /></svg>) }
          ].map((feature, i) => (
            <div key={i} className={`bg-white/40 backdrop-blur-md p-8 hover:bg-white transition-colors ${i !== 2 ? 'border-b md:border-b-0 md:border-r border-[#c3c5bc]' : ''}`}>
              <div className="w-10 h-10 border border-[#a1a39b] flex items-center justify-center text-[#111] mb-6">{feature.icon}</div>
              <h3 className="text-lg font-hud uppercase font-bold text-[#111] mb-4 tracking-wider">{feature.title}</h3>
              <p className="text-xs font-mono text-[#555] uppercase leading-relaxed tracking-wide">{feature.desc}</p>
            </div>
          ))}
        </div>
      </div >

      {/* Dead Man's Switch Section */}
      < div className="max-w-7xl mx-auto px-6 py-12 relative z-20" >
        <div className="bg-white border border-[#c3c5bc] p-10 md:p-16 relative">
          <div className="absolute top-0 right-0 w-16 h-16 bg-[#dddcd5] border-b border-l border-[#c3c5bc]" />
          <div className="grid lg:grid-cols-2 gap-16 items-center">
            <div>
              <span className="inline-block text-[10px] font-mono tracking-widest uppercase mb-4 text-[#b026ff]">Module: Autonomous_Vaults</span>
              <h2 className="text-3xl md:text-5xl font-hud font-bold text-[#111] leading-none mb-6">DEAD MAN'S SWITCH</h2>
              <p className="text-sm font-mono text-[#555] uppercase mb-10 leading-relaxed max-w-lg">Lock SOL in a time-locked vault. If you don't check in, funds automatically release to your beneficiary with full ZK privacy. Trustless, on-chain execution.</p>
              <button onClick={() => window.location.href = '/deadman'} className="border border-[#111] hover:bg-[#111] hover:text-white transition-colors text-xs font-hud tracking-[0.2em] font-bold px-6 py-4 flex items-center gap-4">
                VIEW ARCHITECTURE
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="square" strokeLinejoin="miter" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" /></svg>
              </button>
            </div>
            <div className="grid grid-cols-2 gap-4">
              {[{ label: 'Intervals', value: '7 / 30 / 90d' }, { label: 'Trigger', value: 'Autonomous' }, { label: 'Transfer', value: 'ZK + Stealth' }, { label: 'Messages', value: 'E2E Encrypted' }].map((stat, i) => (
                <div key={i} className="border border-[#e2e4dd] p-6 hover:border-[#c3c5bc] transition-colors">
                  <p className="text-[10px] font-bold text-[#a1a39b] uppercase tracking-widest mb-3">{stat.label}</p>
                  <p className="text-sm font-hud font-bold text-[#111]">{stat.value}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div >

      {/* Encrypted Messages Section */}
      < div className="max-w-7xl mx-auto px-6 py-12 mb-10 relative z-20" >
        <div className="border border-[#c3c5bc] p-10 md:p-16 bg-[#e2e4dd]/50 backdrop-blur-sm">
          <div className="grid lg:grid-cols-2 gap-16 items-center">
            <div className="grid grid-cols-2 gap-0 border border-[#c3c5bc] bg-white order-2 lg:order-1">
              {[{ label: 'Encryption', value: 'NaCl / XSalsa20' }, { label: 'Key Exchange', value: 'ECDH X25519' }, { label: 'Signature', value: 'Ed25519' }, { label: 'Storage', value: 'On-Chain' }].map((stat, i) => (
                <div key={i} className={`p-6 ${i === 0 || i === 1 ? 'border-b' : ''} ${i % 2 === 0 ? 'border-r' : ''} border-[#c3c5bc]`}>
                  <p className="text-[10px] font-bold text-[#a1a39b] uppercase tracking-widest mb-3">{stat.label}</p>
                  <p className="text-[11px] font-mono font-bold text-[#111]">{stat.value}</p>
                </div>
              ))}
            </div>
            <div className="order-1 lg:order-2">
              <span className="inline-block text-[10px] font-mono text-[#b026ff] tracking-widest uppercase mb-4">Module: Secure_Comm</span>
              <h2 className="text-3xl md:text-5xl font-hud font-bold text-[#111] mb-6 leading-none">ENCRYPTED MESSAGING</h2>
              <p className="text-sm font-mono text-[#555] uppercase mb-8 leading-relaxed max-w-lg">Send private memos and metadata directly on-chain. Secured natively by XSalsa20-Poly1305 and ECDH X25519 shared secrets.</p>
              <button onClick={handleLaunch} className="border border-[#111] hover:bg-[#111] hover:text-white transition-colors text-xs font-hud tracking-[0.2em] font-bold px-6 py-4 flex items-center gap-4">
                DEPLOY SECURE CHANNEL
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="square" strokeLinejoin="miter" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" /></svg>
              </button>
            </div>
          </div>
        </div>
      </div >

      {/* CTA Section */}
      < div className="max-w-4xl mx-auto px-6 py-24 text-center relative z-20" >
        <div className="w-16 h-16 mx-auto bg-white border border-[#c3c5bc] clip-angled-tl clip-angled-br flex items-center justify-center mb-8">
          <svg className="w-6 h-6 text-[#111]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="square" strokeLinejoin="miter" strokeWidth={1.5} d="M12 15v2m-6 4h12v-8H6v6zM22 7H2v4h20V7z" /></svg>
        </div>
        <h2 className="text-3xl md:text-5xl font-hud font-bold text-[#111] leading-none mb-6">INITIALIZE_</h2>
        <p className="text-sm font-mono text-[#555] uppercase mb-10 max-w-xl mx-auto">Connect your wallet to deploy private transactions securely on the Solana blockchain. Immutable and open source.</p>
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
          <button onClick={handleLaunch} className="w-full sm:w-auto bg-[#b026ff] hover:bg-[#8e19d6] text-white text-sm font-hud py-4 px-10 clip-angled-tl clip-angled-br transition-all flex items-center justify-center gap-3">
            LAUNCH PROTOCOL
            <span className="text-lg leading-none font-bold">»</span>
          </button>
        </div>
      </div >
      <footer className="relative z-10 border-t border-[#c3c5bc] bg-[#dddcd5] mt-auto">
        <div className="max-w-7xl mx-auto px-6 py-8">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <span className="font-hud tracking-widest text-sm font-bold text-[#111]">SHADOW</span>
              <span className="text-[#a1a39b] font-mono text-xs">SYS_0.1.0</span>
            </div>
            <div className="flex items-center gap-8 font-mono text-xs font-bold text-[#666]">
              <a href="/docs" className="hover:text-[#b026ff] transition-colors">DOCS</a>
              <a href="https://github.com/0x667TI/ShadowProtocol" target="_blank" className="hover:text-[#b026ff] transition-colors">GITHUB</a>
              <a href="https://x.com/shadowp40792" target="_blank" className="hover:text-[#b026ff] transition-colors">X_TWITTER</a>
            </div>
          </div>
        </div>
      </footer>
    </div >
  );
}
