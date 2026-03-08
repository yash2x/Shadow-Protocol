'use client';
import { useState, useEffect, useRef } from 'react';

const steps = [
  {
    id: 1, icon: '◈', tag: 'STEP 01', title: 'Fund Your Wallet',
    subtitle: 'Go to the Faucet tab',
    description: 'New here? Claim free Devnet SOL to get started. One click, 0.2 SOL lands in your embedded wallet — no bank, no KYC, no questions.',
    detail: 'Faucet → Claim 0.2 SOL → Done.',
    accentColor: '#38BDF8',
  },
  {
    id: 2, icon: '◎', tag: 'STEP 02', title: 'Send Privately',
    subtitle: 'Go to the Send tab',
    description: 'Pick an amount, type a @username. That\'s it. No wallet addresses exposed. The recipient never learns where the SOL came from.',
    detail: 'Send tab → @username → Amount → Send.',
    accentColor: '#8B5CF6',
  },
  {
    id: 3, icon: '◉', tag: 'STEP 03', title: 'Receive & Withdraw',
    subtitle: 'Watch the Receive tab',
    description: 'A red dot appears when a payment arrives. Open it, choose where to withdraw — your own wallet, or any other address for maximum privacy.',
    detail: 'Receive tab → Withdraw → Your wallet or custom address.',
    accentColor: '#22C55E',
  },
];

const privacy = [
  { icon: '⬡', label: 'ZK-SNARK Proofs', desc: 'Cryptographic proof with zero knowledge' },
  { icon: '⬡', label: 'No Address Exposure', desc: 'Only @usernames travel the wire' },
  { icon: '⬡', label: 'Randomized Delay', desc: 'Withdrawals execute at random times' },
  { icon: '⬡', label: 'Multi-hop Routing', desc: 'Funds bounce through relayers' },
];

export default function HowItWorks() {
  const [activeStep, setActiveStep] = useState(0);
  const [visible, setVisible] = useState<boolean[]>([false, false, false]);
  const [privacyVisible, setPrivacyVisible] = useState(false);
  const stepRefs = useRef<(HTMLDivElement | null)[]>([]);
  const privacyRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const obs = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          const idx = stepRefs.current.indexOf(entry.target as HTMLDivElement);
          if (idx !== -1 && entry.isIntersecting) {
            setTimeout(() => {
              setVisible((v) => { const n = [...v]; n[idx] = true; return n; });
            }, idx * 120);
          }
        });
      },
      { threshold: 0.15 }
    );
    stepRefs.current.forEach((r) => r && obs.observe(r));
    return () => obs.disconnect();
  }, []);

  useEffect(() => {
    const obs = new IntersectionObserver(
      ([e]) => { if (e.isIntersecting) setPrivacyVisible(true); },
      { threshold: 0.2 }
    );
    if (privacyRef.current) obs.observe(privacyRef.current);
    return () => obs.disconnect();
  }, []);

  useEffect(() => {
    const t = setInterval(() => setActiveStep((s) => (s + 1) % 3), 6000);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="w-full font-mono">
      <div className="mb-8">
        <p className="text-sm font-bold tracking-[0.25em] uppercase text-black text-center mb-2">How It Works</p>
        <h2 className="text-lg font-bold tracking-[0.12em] uppercase text-black text-center">
          Private by Design
        </h2>
        <p className="text-sm font-bold tracking-[0.1em] uppercase text-black text-center mt-1">
          Three steps. Zero traces.
        </p>
      </div>

      <div className="space-y-3 mb-6">
        {steps.map((step, i) => {
          const isActive = activeStep === i;
          return (
            <div
              key={step.id}
              ref={(el) => { stepRefs.current[i] = el; }}
              onClick={() => setActiveStep(i)}
              className="cursor-pointer transition-all duration-500"
              style={{
                opacity: visible[i] ? 1 : 0,
                transform: visible[i] ? 'translateY(0)' : 'translateY(16px)',
                transitionDelay: `${i * 80}ms`,
              }}
            >
              <div
                className="relative overflow-hidden transition-all duration-500"
                style={{
                  border: isActive ? `3px solid ${step.accentColor}` : '2px solid #ccc',
                  background: isActive ? '#f0ece1' : '#fff',
                  boxShadow: isActive ? `4px 4px 0px ${step.accentColor}` : 'none',
                }}
              >
                <div className="p-5">
                  <div className="flex items-start gap-4">
                    <div
                      className="flex-shrink-0 w-12 h-12 flex items-center justify-center transition-all duration-500"
                      style={{
                        border: `2px solid ${isActive ? step.accentColor : '#ccc'}`,
                        background: isActive ? '#dddcd5' : '#f5f5f5',
                      }}
                    >
                      <span className="text-xl font-bold" style={{ color: isActive ? step.accentColor : '#aaa' }}>
                        {step.icon}
                      </span>
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs tracking-[0.3em] font-bold" style={{ color: isActive ? step.accentColor : '#aaa' }}>
                          {step.tag} {isActive && '•'}
                        </span>
                      </div>
                      <h3 className="text-sm font-bold tracking-[0.08em] uppercase mb-0.5 text-black">
                        {step.title}
                      </h3>
                      <p className="text-sm font-bold tracking-[0.05em] uppercase"
                        style={{ color: isActive ? '#333' : '#999' }}>
                        {step.subtitle}
                      </p>
                    </div>

                    <div className="flex-shrink-0 text-3xl font-bold tabular-nums leading-none"
                      style={{ color: isActive ? step.accentColor + '40' : '#eee' }}>
                      0{step.id}
                    </div>
                  </div>

                  <div className="overflow-hidden transition-all duration-500"
                    style={{ maxHeight: isActive ? '200px' : '0px', opacity: isActive ? 1 : 0, marginTop: isActive ? '16px' : '0' }}>
                    <div className="pt-4 border-t-2 border-dashed border-neutral-300">
                      <p className="text-sm font-semibold text-black leading-relaxed mb-3">{step.description}</p>
                      <div className="inline-flex items-center gap-2 px-3 py-1.5 border-2 border-black bg-[#dddcd5]">
                        <div className="w-1.5 h-1.5 bg-black" />
                        <span className="text-xs tracking-[0.15em] uppercase font-bold text-black">{step.detail}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex justify-center gap-2 mb-6">
        {steps.map((step, i) => (
          <button key={i} onClick={() => setActiveStep(i)}
            className="transition-all duration-300"
            style={{
              width: activeStep === i ? '20px' : '6px',
              height: '6px',
              background: activeStep === i ? step.accentColor : '#ccc',
              borderRadius: activeStep === i ? '3px' : '50%',
            }}
          />
        ))}
      </div>

      <div ref={privacyRef}>
        <div className="border-2 border-black p-5 bg-white shadow-[4px_4px_0px_#000] transition-all duration-700"
          style={{ opacity: privacyVisible ? 1 : 0, transform: privacyVisible ? 'translateY(0)' : 'translateY(12px)' }}>
          <p className="text-sm font-bold tracking-[0.2em] uppercase text-black mb-4 text-center">Privacy Stack</p>
          <div className="grid grid-cols-2 gap-3">
            {privacy.map((p, i) => (
              <div key={i} className="flex items-start gap-2 p-3 border-2 border-neutral-200 bg-[#f0ece1] transition-all duration-500"
                style={{ opacity: privacyVisible ? 1 : 0, transitionDelay: `${i * 80 + 200}ms` }}>
                <span className="text-sm text-black mt-0.5 flex-shrink-0 font-bold">{p.icon}</span>
                <div>
                  <p className="text-xs font-bold tracking-[0.1em] uppercase text-black mb-0.5">{p.label}</p>
                  <p className="text-xs font-bold text-neutral-600 leading-relaxed">{p.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-5 text-center">
        <p className="text-sm font-bold tracking-[0.1em] uppercase text-black leading-relaxed">
          Shadow Protocol runs on Solana Devnet.<br />
          All tokens are for testing only — no real value.
        </p>
      </div>
    </div>
  );
}
