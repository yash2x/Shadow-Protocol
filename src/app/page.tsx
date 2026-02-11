'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

export default function HomePage() {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [launching, setLaunching] = useState(false);

  const playLaunchSound = () => {
    try {
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      
      // Dramatic whoosh/bat screech effect
      const osc1 = ctx.createOscillator();
      const osc2 = ctx.createOscillator();
      const osc3 = ctx.createOscillator();
      const gain1 = ctx.createGain();
      const gain2 = ctx.createGain();
      const gain3 = ctx.createGain();
      
      osc1.connect(gain1); gain1.connect(ctx.destination);
      osc2.connect(gain2); gain2.connect(ctx.destination);
      osc3.connect(gain3); gain3.connect(ctx.destination);
      
      // High pitch screech
      osc1.type = 'sawtooth';
      osc1.frequency.setValueAtTime(2000, ctx.currentTime);
      osc1.frequency.exponentialRampToValueAtTime(100, ctx.currentTime + 0.5);
      gain1.gain.setValueAtTime(0.15, ctx.currentTime);
      gain1.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.5);
      
      // Low rumble
      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(80, ctx.currentTime);
      osc2.frequency.exponentialRampToValueAtTime(40, ctx.currentTime + 0.6);
      gain2.gain.setValueAtTime(0.2, ctx.currentTime);
      gain2.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.6);
      
      // Mid swoosh
      osc3.type = 'triangle';
      osc3.frequency.setValueAtTime(800, ctx.currentTime);
      osc3.frequency.exponentialRampToValueAtTime(200, ctx.currentTime + 0.4);
      gain3.gain.setValueAtTime(0.1, ctx.currentTime);
      gain3.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.4);
      
      osc1.start(ctx.currentTime); osc1.stop(ctx.currentTime + 0.5);
      osc2.start(ctx.currentTime); osc2.stop(ctx.currentTime + 0.6);
      osc3.start(ctx.currentTime); osc3.stop(ctx.currentTime + 0.4);
    } catch {}
  };

  const handleLaunch = () => {
    setLaunching(true);
    playLaunchSound();
    setTimeout(() => router.push('/main'), 800);
  };

  useEffect(() => { setMounted(true); }, []);

  if (!mounted) return null;

  return (
    <div className="min-h-screen bg-black text-white overflow-x-hidden font-mono">
      {/* Launch Animation Overlay */}
      {launching && (
        <div className="fixed inset-0 z-[100] bg-black flex items-center justify-center animate-launchFlash">
          <div className="text-center animate-launchZoom">
            <div className="w-32 h-32 mx-auto mb-6 relative">
              <div className="absolute inset-0 bg-[#8B5CF6] blur-[60px] animate-pulse" />
              <img src="/logo.png" alt="Shadow" className="relative w-full h-full object-contain" />
            </div>
            <p className="text-[14px] tracking-[0.4em] uppercase text-[#8B5CF6] animate-pulse">Entering Shadow...</p>
          </div>
          {/* Particle burst */}
          <div className="absolute inset-0 overflow-hidden pointer-events-none">
            {Array.from({ length: 20 }).map((_, i) => (
              <div
                key={i}
                className="absolute w-2 h-2 bg-[#8B5CF6] rounded-full animate-particleBurst"
                style={{
                  left: '50%',
                  top: '50%',
                  animationDelay: `${i * 0.03}s`,
                  transform: `rotate(${i * 18}deg)`,
                }}
              />
            ))}
          </div>
        </div>
      )}

      {/* Background */}
      <div className="fixed inset-0 opacity-30">
        <div className="absolute inset-0 bg-gradient-to-br from-[#8B5CF6]/10 via-transparent to-[#6366F1]/10" />
        <div className="absolute top-1/4 left-1/4 w-64 md:w-96 h-64 md:h-96 bg-[#8B5CF6]/20 rounded-full blur-[100px] md:blur-[150px] animate-pulse" />
        <div className="absolute bottom-1/4 right-1/4 w-64 md:w-96 h-64 md:h-96 bg-[#6366F1]/20 rounded-full blur-[100px] md:blur-[150px] animate-pulse" style={{ animationDelay: '1s' }} />
      </div>

      {/* Grid */}
      <div className="fixed inset-0 opacity-[0.04]">
        <div className="absolute inset-0" style={{ backgroundImage: 'linear-gradient(#8B5CF6 1px, transparent 1px), linear-gradient(90deg, #8B5CF6 1px, transparent 1px)', backgroundSize: '50px 50px' }} />
      </div>

      {/* Header */}
      <header className="relative border-b border-white/[0.08] backdrop-blur-xl bg-black/50 sticky top-0 z-50">
        <div className="w-full px-4 md:px-8 py-3 md:py-4 flex items-center justify-between">
          <div className="flex items-center gap-2 md:gap-3">
            <img src="/logo.png" alt="Shadow" className="w-7 h-7 md:w-8 md:h-8 object-contain" />
            <span className="text-[13px] md:text-[14px] font-bold tracking-[0.2em] uppercase">Shadow</span>
          </div>

          <div className="hidden md:flex items-center gap-3">
            <a href="https://x.com/shadowp40792" target="_blank" rel="noopener noreferrer" className="w-10 h-10 flex items-center justify-center border border-white/[0.15] hover:border-[#8B5CF6]/50 hover:bg-[#8B5CF6]/10 transition-all">
              <svg className="w-4 h-4 text-white/70" fill="currentColor" viewBox="0 0 24 24"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" /></svg>
            </a>
            <a href="https://github.com/Shadowprtcl" target="_blank" rel="noopener noreferrer" className="w-10 h-10 flex items-center justify-center border border-white/[0.15] hover:border-[#8B5CF6]/50 hover:bg-[#8B5CF6]/10 transition-all">
              <svg className="w-4 h-4 text-white/70" fill="currentColor" viewBox="0 0 24 24"><path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" /></svg>
            </a>
            <a href="/docs" className="px-5 py-2.5 border border-white/[0.15] text-[10px] tracking-[0.2em] uppercase font-bold hover:border-[#8B5CF6]/50 hover:bg-[#8B5CF6]/10 transition-all">Docs</a>
            <button onClick={handleLaunch} className="px-6 py-2.5 bg-[#8B5CF6] text-white text-[10px] tracking-[0.2em] uppercase font-bold hover:bg-[#7C3AED] hover:shadow-[0_0_30px_rgba(139,92,246,0.5)] transition-all">Launch App</button>
          </div>

          <div className="flex md:hidden items-center gap-2">
            <button onClick={handleLaunch} className="px-4 py-2 bg-[#8B5CF6] text-white text-[9px] tracking-[0.15em] uppercase font-bold">App</button>
            <button onClick={() => setMenuOpen(!menuOpen)} className="w-9 h-9 flex items-center justify-center border border-white/[0.15]">
              <svg className="w-4 h-4 text-white/70" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                {menuOpen ? <path strokeLinecap="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /> : <path strokeLinecap="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />}
              </svg>
            </button>
          </div>
        </div>

        {menuOpen && (
          <div className="md:hidden border-t border-white/[0.08] bg-black/95 backdrop-blur-xl">
            <div className="px-4 py-4 space-y-3">
              <a href="/docs" className="block py-2 text-[11px] tracking-[0.2em] uppercase text-white/70">Docs</a>
              <a href="https://x.com/shadowp40792" target="_blank" rel="noopener noreferrer" className="block py-2 text-[11px] tracking-[0.2em] uppercase text-white/70">X (Twitter)</a>
              <a href="https://github.com/Shadowprtcl" target="_blank" rel="noopener noreferrer" className="block py-2 text-[11px] tracking-[0.2em] uppercase text-white/70">GitHub</a>
            </div>
          </div>
        )}
      </header>

      {/* Hero */}
      <main className="relative">
        <div className="w-full px-4 md:px-8 py-12 md:py-20 lg:py-28">
          <div className="text-center mb-16 md:mb-20 lg:mb-28 animate-fadeIn">
            <div className="relative w-32 h-32 md:w-44 md:h-44 lg:w-56 lg:h-56 mx-auto mb-8 md:mb-12 group cursor-pointer">
              <div className="hidden md:block absolute inset-0 rounded-full border border-[#8B5CF6]/20 animate-ping" style={{ animationDuration: '3s' }} />
              <div className="absolute inset-0 blur-[60px] md:blur-[80px] bg-[#8B5CF6] opacity-30 group-hover:opacity-50 transition-opacity duration-500" />
              <div className="relative w-full h-full flex items-center justify-center transform transition-all duration-500 group-hover:scale-110 group-hover:rotate-6">
                <img src="/logo.png" alt="Shadow Protocol Logo" className="w-full h-full object-contain drop-shadow-[0_0_30px_rgba(139,92,246,0.5)]" />
              </div>
            </div>

            <h1 className="text-[24px] md:text-[36px] lg:text-[48px] font-bold tracking-[0.1em] md:tracking-[0.15em] uppercase mb-3 bg-gradient-to-r from-white via-white to-[#8B5CF6] bg-clip-text text-transparent">Shadow Protocol</h1>
            <p className="text-[10px] md:text-[12px] lg:text-[13px] tracking-[0.3em] md:tracking-[0.4em] uppercase text-white/50 mb-10 md:mb-14">Private • Anonymous • Untraceable</p>
            
            {/* Big Launch Button */}
            <button 
              onClick={handleLaunch} 
              className="group relative px-10 md:px-14 py-4 md:py-5 bg-[#8B5CF6] text-white text-[11px] md:text-[12px] font-bold tracking-[0.25em] uppercase overflow-hidden hover:shadow-[0_0_60px_rgba(139,92,246,0.6)] transition-all duration-500"
            >
              <span className="relative z-10">Enter Protocol</span>
              <div className="absolute inset-0 bg-gradient-to-r from-[#7C3AED] via-[#8B5CF6] to-[#6366F1] opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
              <div className="absolute inset-0 opacity-0 group-hover:opacity-30">
                <div className="absolute inset-0 bg-white animate-shimmer" />
              </div>
            </button>
          </div>

          <div className="grid md:grid-cols-3 gap-4 md:gap-5 max-w-4xl mx-auto mb-14 md:mb-18">
            {[
              { title: 'Zero-Knowledge', desc: 'Cryptographic proofs ensure complete transaction privacy', icon: 'lock' },
              { title: 'Multi-Hop Relay', desc: 'Random routing breaks on-chain analysis', icon: 'bolt' },
              { title: 'Anonymity Sets', desc: 'Shared pools maximize privacy guarantees', icon: 'users' }
            ].map((feature, i) => (
              <div key={i} className="group bg-[#0a0a0f]/80 p-6 md:p-7 border border-white/[0.08] hover:border-[#8B5CF6]/30 transition-all duration-500">
                <div className="w-12 h-12 md:w-14 md:h-14 border border-white/[0.1] group-hover:border-[#8B5CF6]/50 flex items-center justify-center text-[#8B5CF6]/70 group-hover:text-[#8B5CF6] mb-5 transition-all">
                  {feature.icon === 'lock' && <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeWidth={1.5} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>}
                  {feature.icon === 'bolt' && <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeWidth={1.5} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>}
                  {feature.icon === 'users' && <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" /></svg>}
                </div>
                <h3 className="text-[10px] md:text-[11px] font-bold tracking-[0.2em] uppercase mb-2 text-white group-hover:text-[#8B5CF6] transition-colors">{feature.title}</h3>
                <p className="text-[9px] md:text-[10px] tracking-[0.1em] uppercase text-white/40 leading-relaxed">{feature.desc}</p>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-3 gap-3 md:gap-4 max-w-3xl mx-auto mb-14 md:mb-18">
            {[{ label: 'Privacy', value: 'Maximum' }, { label: 'Proof', value: 'Groth16' }, { label: 'Network', value: 'Solana' }].map((stat, i) => (
              <div key={i} className="bg-[#0a0a0f]/80 p-5 md:p-6 text-center border border-white/[0.08] hover:border-[#8B5CF6]/30 transition-all">
                <p className="text-[8px] md:text-[9px] tracking-[0.2em] uppercase text-white/35 mb-1">{stat.label}</p>
                <p className="text-[10px] md:text-[12px] font-bold tracking-[0.15em] uppercase text-[#8B5CF6]">{stat.value}</p>
              </div>
            ))}
          </div>

          {/* Bottom CTA */}
          <div className="text-center">
            <div className="inline-block border border-white/[0.1] bg-[#0a0a0f]/80 p-8 md:p-10 hover:border-[#8B5CF6]/30 transition-all">
              <h3 className="text-[13px] md:text-[15px] font-bold tracking-[0.2em] uppercase mb-3">Ready to go private?</h3>
              <p className="text-[9px] md:text-[10px] tracking-[0.15em] uppercase text-white/40 mb-6">Anonymous transfers in seconds</p>
              <button 
                onClick={handleLaunch} 
                className="px-10 py-4 bg-[#8B5CF6] text-white text-[10px] font-bold tracking-[0.25em] uppercase hover:bg-[#7C3AED] hover:shadow-[0_0_40px_rgba(139,92,246,0.5)] transition-all"
              >
                Launch Protocol
              </button>
            </div>
          </div>
        </div>
      </main>

      {/* Footer - More visible */}
      <footer className="relative border-t border-white/[0.1] mt-10 md:mt-16">
        <div className="w-full px-4 md:px-8 py-6 md:py-8">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <img src="/logo.png" alt="Shadow" className="w-5 h-5 object-contain opacity-70" />
              <span className="text-[10px] tracking-[0.2em] uppercase text-white/50 font-bold">Shadow Protocol 2026</span>
            </div>
            <div className="flex items-center gap-8">
              <a href="/docs" className="text-[10px] tracking-[0.15em] uppercase text-white/40 hover:text-[#8B5CF6] transition-colors font-bold">Docs</a>
              <a href="https://github.com/Shadowprtcl" target="_blank" className="text-[10px] tracking-[0.15em] uppercase text-white/40 hover:text-[#8B5CF6] transition-colors font-bold">GitHub</a>
              <a href="https://x.com/shadowp40792" target="_blank" className="text-[10px] tracking-[0.15em] uppercase text-white/40 hover:text-[#8B5CF6] transition-colors font-bold">X</a>
            </div>
          </div>
        </div>
      </footer>

      <style jsx global>{`
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes shimmer { 0% { transform: translateX(-100%); } 100% { transform: translateX(100%); } }
        @keyframes launchFlash { 0% { opacity: 0; } 20% { opacity: 1; } 100% { opacity: 1; } }
        @keyframes launchZoom { 0% { transform: scale(0.5); opacity: 0; } 50% { transform: scale(1.2); opacity: 1; } 100% { transform: scale(1); opacity: 1; } }
        @keyframes particleBurst { 0% { transform: rotate(var(--rotation, 0deg)) translateX(0); opacity: 1; } 100% { transform: rotate(var(--rotation, 0deg)) translateX(200px); opacity: 0; } }
        .animate-fadeIn { animation: fadeIn 1s ease-out forwards; }
        .animate-shimmer { animation: shimmer 2s infinite; }
        .animate-launchFlash { animation: launchFlash 0.8s ease-out forwards; }
        .animate-launchZoom { animation: launchZoom 0.6s ease-out forwards; }
        .animate-particleBurst { animation: particleBurst 0.8s ease-out forwards; }
      `}</style>
    </div>
  );
}
