'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { DynamicWidget, useDynamicContext, useUserWallets, useIsLoggedIn } from '@dynamic-labs/sdk-react-core';
import { isSolanaWallet } from '@dynamic-labs/solana';
import { Connection, Transaction, TransactionInstruction, SystemProgram, PublicKey } from '@solana/web3.js';
import { PROGRAM_ID, DENOMINATIONS } from '@/config';
import { supabase, User, PendingTransfer } from '@/lib/supabase';
import HowItWorks from '@/components/HowItWorks';
import AnimatedBackground from '@/components/AnimatedBackground';
import nacl from 'tweetnacl';
import { encodeBase64, decodeBase64, encodeUTF8, decodeUTF8 } from 'tweetnacl-util';

const DISCRIMINATORS = { deposit: [242, 35, 198, 137, 82, 225, 242, 182] };
const AGENT_URL = process.env.NEXT_PUBLIC_AGENT_URL || 'https://shadow-protocol.xyz/api/agent';
const RPC_URL = 'https://api.devnet.solana.com';

const DEFAULT_AVATARS = [
  'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="100" height="100"%3E%3Ccircle cx="50" cy="50" r="45" fill="%238B5CF6"/%3E%3Ccircle cx="50" cy="40" r="15" fill="white"/%3E%3Cellipse cx="50" cy="75" rx="25" ry="20" fill="white"/%3E%3C/svg%3E',
  'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="100" height="100"%3E%3Crect width="100" height="100" fill="%236366F1"/%3E%3Ccircle cx="50" cy="40" r="15" fill="white"/%3E%3Crect x="30" y="60" width="40" height="30" rx="15" fill="white"/%3E%3C/svg%3E',
  'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="100" height="100"%3E%3Ccircle cx="50" cy="50" r="45" fill="%2322C55E"/%3E%3Cpath d="M 35 40 Q 40 35 45 40" stroke="white" stroke-width="3" fill="none"/%3E%3Cpath d="M 55 40 Q 60 35 65 40" stroke="white" stroke-width="3" fill="none"/%3E%3Cpath d="M 35 65 Q 50 75 65 65" stroke="white" stroke-width="3" fill="none"/%3E%3C/svg%3E',
  'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="100" height="100"%3E%3Ccircle cx="50" cy="50" r="45" fill="%23F59E0B"/%3E%3Ccircle cx="40" cy="40" r="5" fill="white"/%3E%3Ccircle cx="60" cy="40" r="5" fill="white"/%3E%3Cpath d="M 30 60 L 70 60" stroke="white" stroke-width="4"/%3E%3C/svg%3E',
  'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="100" height="100"%3E%3Ccircle cx="50" cy="50" r="45" fill="%23EF4444"/%3E%3Cpolygon points="50,25 65,45 35,45" fill="white"/%3E%3Crect x="35" y="50" width="30" height="30" fill="white"/%3E%3C/svg%3E',
  'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="100" height="100"%3E%3Ccircle cx="50" cy="50" r="45" fill="%233B82F6"/%3E%3Cpolygon points="50,20 61,44 87,44 66,60 75,84 50,68 25,84 34,60 13,44 39,44" fill="white"/%3E%3C/svg%3E',
];

const generateSecret = (): string => { const a = new Uint8Array(32); crypto.getRandomValues(a); return Array.from(a).map(b => b.toString(16).padStart(2, '0')).join(''); };
const generateNullifier = (): string => { const a = new Uint8Array(32); crypto.getRandomValues(a); return Array.from(a).map(b => b.toString(16).padStart(2, '0')).join(''); };
const createNote = (poolId: number, amount: number, secret: string, nullifier: string): string => `shadow-${poolId}-${amount}-${secret}-${nullifier}`;
const parseNote = (note: string) => { const p = note.split('-'); if (p.length !== 5 || p[0] !== 'shadow') return null; return { poolId: parseInt(p[1]), amount: parseFloat(p[2]), secret: p[3], nullifier: p[4] }; };
const hexToBytes = (hex: string): number[] => { const b: number[] = []; for (let i = 0; i < hex.length; i += 2) b.push(parseInt(hex.substr(i, 2), 16)); return b; };
const generateKeyPair = () => { const kp = nacl.box.keyPair(); return { publicKey: encodeBase64(kp.publicKey), secretKey: encodeBase64(kp.secretKey) }; };
const generateStealthMetaKey = () => { const scan = nacl.box.keyPair(); const spend = nacl.box.keyPair(); return { metaKey: encodeBase64(scan.publicKey) + ':' + encodeBase64(spend.publicKey), scanSecret: encodeBase64(scan.secretKey), spendSecret: encodeBase64(spend.secretKey) }; };
const generateStealthAddress = (metaKey: string, ephemeralSecret: Uint8Array): { address: string; ephemeralPub: string } => { const [scanPub] = metaKey.split(':'); const ephemeralPair = nacl.box.keyPair.fromSecretKey(ephemeralSecret); const shared = nacl.box.before(decodeBase64(scanPub), ephemeralSecret); const sharedHash = nacl.hash(shared).slice(0, 32); const stealthPub = nacl.box.keyPair.fromSecretKey(sharedHash).publicKey; return { address: encodeBase64(stealthPub), ephemeralPub: encodeBase64(ephemeralPair.publicKey) }; };
const scanStealthPayment = (ephemeralPub: string, scanSecret: string, _spendPub: string): string => { const shared = nacl.box.before(decodeBase64(ephemeralPub), decodeBase64(scanSecret)); const sharedHash = nacl.hash(shared).slice(0, 32); const stealthPub = nacl.box.keyPair.fromSecretKey(sharedHash).publicKey; return encodeBase64(stealthPub); };
const encryptMessage = (message: string, recipientPublicKey: string, senderSecretKey: string): string => { const nonce = nacl.randomBytes(nacl.box.nonceLength); const msgBytes = new TextEncoder().encode(message); const encrypted = nacl.box(msgBytes, nonce, decodeBase64(recipientPublicKey), decodeBase64(senderSecretKey)); const full = new Uint8Array(nonce.length + encrypted.length); full.set(nonce); full.set(encrypted, nonce.length); return encodeBase64(full); };
const decryptMessage = (encrypted: string, senderPublicKey: string, recipientSecretKey: string): string | null => { try { const full = decodeBase64(encrypted); const nonce = full.slice(0, nacl.box.nonceLength); const msg = full.slice(nacl.box.nonceLength); const decrypted = nacl.box.open(msg, nonce, decodeBase64(senderPublicKey), decodeBase64(recipientSecretKey)); return decrypted ? new TextDecoder().decode(decrypted) : null; } catch { return null; } };

const playSound = (type: 'send' | 'receive' | 'success' | 'error') => {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const t = ctx.currentTime;
    if (type === 'success') {
      // Ka-ching: metallic coin drop + register bell
      const buf = ctx.createBuffer(1, ctx.sampleRate * 0.8, ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < data.length; i++) {
        const t2 = i / ctx.sampleRate;
        // Metallic coin sound - multiple high frequencies beating together
        const coin = Math.sin(2 * Math.PI * 3500 * t2) * 0.3 +
                     Math.sin(2 * Math.PI * 4200 * t2) * 0.2 +
                     Math.sin(2 * Math.PI * 5800 * t2) * 0.15;
        // Register bell - lower warm tone
        const bell = Math.sin(2 * Math.PI * 2200 * t2) * 0.25 +
                     Math.sin(2 * Math.PI * 1100 * t2) * 0.15;
        // Envelope: sharp attack, quick decay
        const coinEnv = t2 < 0.005 ? t2 / 0.005 : Math.exp(-t2 * 12);
        const bellEnv = t2 < 0.15 ? 0 : (t2 < 0.16 ? (t2 - 0.15) / 0.01 : Math.exp(-(t2 - 0.16) * 6));
        data[i] = (coin * coinEnv + bell * bellEnv) * 0.12;
      }
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.connect(ctx.destination);
      src.start(t);
    } else if (type === 'send') {
      [1046, 1318].forEach((freq, i) => {
        const o = ctx.createOscillator(); const g = ctx.createGain();
        o.connect(g); g.connect(ctx.destination); o.type = 'sine';
        const start = t + i * 0.08;
        o.frequency.setValueAtTime(freq, start);
        g.gain.setValueAtTime(0, t); g.gain.setValueAtTime(0.06 - i * 0.01, start);
        g.gain.exponentialRampToValueAtTime(0.001, start + 0.15);
        o.start(start); o.stop(start + 0.2);
      });
    } else if (type === 'receive') {
      [1396, 1175, 1046].forEach((freq, i) => {
        const o = ctx.createOscillator(); const g = ctx.createGain();
        o.connect(g); g.connect(ctx.destination); o.type = 'sine';
        const start = t + i * 0.09;
        o.frequency.setValueAtTime(freq, start);
        g.gain.setValueAtTime(0, t); g.gain.setValueAtTime(0.05, start);
        g.gain.exponentialRampToValueAtTime(0.001, start + 0.15);
        o.start(start); o.stop(start + 0.2);
      });
    } else {
      const o = ctx.createOscillator(); const g = ctx.createGain();
      o.connect(g); g.connect(ctx.destination); o.type = 'sine';
      o.frequency.setValueAtTime(280, t);
      g.gain.setValueAtTime(0.04, t); g.gain.setValueAtTime(0.001, t + 0.1);
      g.gain.setValueAtTime(0.04, t + 0.15);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
      o.start(t); o.stop(t + 0.35);
    }
  } catch { }
};
interface TransactionProof { signature: string; amount: number; recipient?: string; timestamp: number; type: 'sent' | 'received'; }
interface WithdrawalState { id: string; amount: number; status: 'pending' | 'processing' | 'completed' | 'failed'; executeAt: number; createdAt: number; delay: number; from?: string; signature?: string; notified?: boolean; is_stealth?: boolean; }
const WITHDRAWALS_KEY = 'shadow_withdrawals_v12';
interface FaucetStatus { enabled: boolean; balance: number; claimAmount: number; claimsRemaining: number; cooldownHours: number; }
interface FaucetClaimResult { canClaim: boolean; hoursRemaining?: number; nextClaimAt?: string; reason?: string; }
const isValidSolanaAddress = (addr: string): boolean => /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(addr);
const ImageCropperModal = ({ imageFile, onCropComplete, onCancel }: { imageFile: File; onCropComplete: (blob: Blob) => void; onCancel: () => void }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [scale, setScale] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [canvasSize, setCanvasSize] = useState(300);
  useEffect(() => { const updateSize = () => { setCanvasSize(window.innerWidth < 500 ? Math.min(280, window.innerWidth - 48) : 350); }; updateSize(); window.addEventListener('resize', updateSize); return () => window.removeEventListener('resize', updateSize); }, []);
  useEffect(() => { const img = new Image(); const url = URL.createObjectURL(imageFile); img.onload = () => { setImage(img); const s = canvasSize * 0.75 / Math.min(img.width, img.height) * 1.2; setScale(s); setPosition({ x: (canvasSize - img.width * s) / 2, y: (canvasSize - img.height * s) / 2 }); }; img.src = url; return () => URL.revokeObjectURL(url); }, [imageFile, canvasSize]);
  useEffect(() => { if (!image || !canvasRef.current) return; const canvas = canvasRef.current; const ctx = canvas.getContext('2d'); if (!ctx) return; const cs = canvasSize * 0.125; const cz = canvasSize * 0.75; ctx.fillStyle = '#f0ece1'; ctx.fillRect(0, 0, canvasSize, canvasSize); ctx.drawImage(image, position.x, position.y, image.width * scale, image.height * scale); ctx.fillStyle = 'rgba(255,255,255,0.7)'; ctx.fillRect(0, 0, canvasSize, cs); ctx.fillRect(0, cs + cz, canvasSize, cs); ctx.fillRect(0, cs, cs, cz); ctx.fillRect(cs + cz, cs, cs, cz); ctx.strokeStyle = '#000'; ctx.lineWidth = 3; ctx.strokeRect(cs, cs, cz, cz); }, [image, scale, position, canvasSize]);
  const getPos = (e: React.MouseEvent | React.TouchEvent) => 'touches' in e ? { x: e.touches[0].clientX, y: e.touches[0].clientY } : { x: e.clientX, y: e.clientY };
  const handleCrop = () => { if (!canvasRef.current || !image) return; const cs = canvasSize * 0.125; const cz = canvasSize * 0.75; const cc = document.createElement('canvas'); cc.width = 300; cc.height = 300; const ctx = cc.getContext('2d'); if (!ctx) return; ctx.drawImage(image, (cs - position.x) / scale, (cs - position.y) / scale, cz / scale, cz / scale, 0, 0, 300, 300); cc.toBlob((blob) => { if (blob) onCropComplete(blob); }, 'image/jpeg', 0.9); };
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-white/40 backdrop-blur-md p-3">
      <div className="bg-[#f0ece1] p-4 md:p-6 w-full max-w-[400px] shadow-[8px_8px_0px_#000] border-2 border-black">
        <h2 className="text-[13px] font-bold tracking-[0.2em] uppercase text-black mb-3 text-center">Crop Your Avatar</h2>
        <p className="text-[13px] text-neutral-500 text-center mb-3">Drag to position · Scroll to zoom</p>
        <div className="mb-4 flex justify-center">
          <canvas ref={canvasRef} width={canvasSize} height={canvasSize} className="border-2 border-black cursor-move bg-white" style={{ touchAction: 'none' }}
            onMouseDown={(e) => { e.preventDefault(); const p = getPos(e); setIsDragging(true); setDragStart({ x: p.x - position.x, y: p.y - position.y }); }}
            onMouseMove={(e) => { if (!isDragging) return; const p = getPos(e); setPosition({ x: p.x - dragStart.x, y: p.y - dragStart.y }); }}
            onMouseUp={() => setIsDragging(false)} onMouseLeave={() => setIsDragging(false)}
            onTouchStart={(e) => { e.preventDefault(); const p = getPos(e); setIsDragging(true); setDragStart({ x: p.x - position.x, y: p.y - position.y }); }}
            onTouchMove={(e) => { if (!isDragging) return; const p = getPos(e); setPosition({ x: p.x - dragStart.x, y: p.y - dragStart.y }); }}
            onTouchEnd={() => setIsDragging(false)} />
        </div>
        <label className="text-[13px] tracking-[0.2em] uppercase text-neutral-500 block mb-2 font-bold">Zoom</label>
        <input type="range" min="0.3" max="4" step="0.05" value={scale} onChange={(e) => setScale(parseFloat(e.target.value))} className="w-full mb-5 accent-black" />
        <div className="flex gap-2">
          <button onClick={onCancel} className="flex-1 py-2.5 bg-[#dddcd5] border-2 border-black text-[13px] font-bold tracking-[0.2em] uppercase text-black hover:bg-neutral-300 transition-colors">Cancel</button>
          <button onClick={handleCrop} className="flex-1 py-2.5 bg-black border-2 border-black text-white text-[13px] font-bold tracking-[0.2em] uppercase hover:bg-neutral-800 transition-colors">Save Avatar</button>
        </div>
      </div>
    </div>
  );
};

const FaucetTab = ({ walletAddress }: { walletAddress: string | null }) => {
  const [faucetAddress, setFaucetAddress] = useState('');
  const [faucetStatus, setFaucetStatus] = useState<FaucetStatus | null>(null);
  const [claimState, setClaimState] = useState<'idle' | 'checking' | 'claiming' | 'success' | 'cooldown' | 'error'>('idle');
  const [claimResult, setClaimResult] = useState<{ signature?: string; hoursRemaining?: number; nextClaimAt?: string; errorMsg?: string } | null>(null);
  const [addressError, setAddressError] = useState('');
  const [copied, setCopied] = useState(false);
  useEffect(() => { if (walletAddress && !faucetAddress) setFaucetAddress(walletAddress); }, [walletAddress]);
  useEffect(() => { const loadStatus = async () => { try { const res = await fetch(`${AGENT_URL}/faucet/status`); if (res.ok) setFaucetStatus(await res.json()); } catch { } }; loadStatus(); const interval = setInterval(loadStatus, 30000); return () => clearInterval(interval); }, []);
  const copyAddress = () => { if (!walletAddress) return; navigator.clipboard.writeText(walletAddress); setCopied(true); setTimeout(() => setCopied(false), 2000); };
  const handleClaim = async () => {
    const addr = faucetAddress.trim();
    if (!addr) { setAddressError('Enter a wallet address'); return; }
    if (!isValidSolanaAddress(addr)) { setAddressError('Invalid Solana address'); return; }
    setAddressError(''); setClaimState('checking'); setClaimResult(null);
    try {
      const checkRes = await fetch(`${AGENT_URL}/faucet/check/${addr}`);
      const checkData: FaucetClaimResult = await checkRes.json();
      if (!checkData.canClaim) { setClaimState('cooldown'); setClaimResult({ hoursRemaining: checkData.hoursRemaining, nextClaimAt: checkData.nextClaimAt }); return; }
      setClaimState('claiming');
      const claimRes = await fetch(`${AGENT_URL}/faucet/claim`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ walletAddress: addr }) });
      const claimData = await claimRes.json();
      if (!claimRes.ok) { if (claimRes.status === 429) { setClaimState('cooldown'); setClaimResult({ hoursRemaining: claimData.hoursRemaining }); } else { setClaimState('error'); setClaimResult({ errorMsg: claimData.error || 'Claim failed' }); } return; }
      setClaimState('success'); setClaimResult({ signature: claimData.signature });
      try { const s = await fetch(`${AGENT_URL}/faucet/status`); if (s.ok) setFaucetStatus(await s.json()); } catch { }
    } catch (err: any) { setClaimState('error'); setClaimResult({ errorMsg: err?.message || 'Network error' }); }
  };
  return (
    <div className="space-y-4 animate-fadeIn">
      {walletAddress && (
        <div className="bg-white p-4 border-2 border-black shadow-[4px_4px_0px_#000] transition-colors">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs tracking-[0.2em] uppercase text-neutral-500 font-bold">Your Wallet Address</span>
            <span className="text-[11px] tracking-[0.15em] uppercase text-black font-bold bg-[#dddcd5] px-2 py-0.5 border border-black">Devnet</span>
          </div>
          <div className="flex items-center gap-2 bg-[#f0ece1] border border-black px-3 py-2.5 mt-1">
            <span className="flex-1 text-[12px] text-black font-mono font-semibold truncate">{walletAddress}</span>
            <button onClick={copyAddress} className="text-[11px] font-bold tracking-[0.15em] uppercase text-black hover:opacity-70 transition-colors whitespace-nowrap">{copied ? '✓ Copied' : 'Copy'}</button>
          </div>
        </div>
      )}
      <div className="bg-white p-4 md:p-5 border-2 border-black shadow-[4px_4px_0px_#000] relative overflow-hidden">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 border-2 border-black bg-[#dddcd5] flex items-center justify-center flex-shrink-0">
            <svg className="w-5 h-5 text-black" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2C12 2 5 10.5 5 15a7 7 0 0014 0C19 10.5 12 2 12 2z" /></svg>
          </div>
          <div>
            <h2 className="text-sm font-bold text-black uppercase tracking-wider">Devnet Faucet</h2>
            <p className="text-xs font-semibold text-neutral-500">Free SOL for testing · 1 claim / 6h</p>
          </div>
        </div>
        {faucetStatus && (
          <div className="pt-4 border-t-2 border-dashed border-neutral-300">
            <div className="flex justify-between items-center mb-2">
              <span className="text-xs font-bold tracking-[0.2em] uppercase text-neutral-500">Faucet Balance</span>
              <span className="text-sm font-bold text-black">{faucetStatus.balance.toFixed(2)} SOL</span>
            </div>
            <div className="h-2 bg-neutral-200 border border-black overflow-hidden">
              <div className="h-full bg-black transition-all duration-1000" style={{ width: `${Math.min(100, (faucetStatus.balance / 10) * 100)}%` }} />
            </div>
            <div className="flex justify-between mt-2">
              <span className="text-[11px] font-semibold text-neutral-500">~{faucetStatus.claimsRemaining} claims remaining</span>
              <span className="text-[11px] font-semibold text-neutral-500">{faucetStatus.claimAmount} SOL per claim</span>
            </div>
          </div>
        )}
      </div>
      <div className="bg-white p-4 md:p-5 border-2 border-black shadow-[2px_2px_0px_#000] md:shadow-[2px_2px_0px_#000] md:shadow-[4px_4px_0px_#000]">
        <span className="text-xs tracking-[0.2em] uppercase text-black font-bold mb-2 block">Wallet Address</span>
        <div className={`flex items-center border-2 bg-[#f0ece1] transition-colors mb-2 ${addressError ? 'border-red-500' : 'border-black'}`}>
          <input type="text" value={faucetAddress} onChange={(e) => { setFaucetAddress(e.target.value); setAddressError(''); setClaimState('idle'); setClaimResult(null); }} placeholder="Solana wallet address" className="flex-1 bg-transparent py-3 px-3 text-sm text-black placeholder-neutral-500 outline-none font-mono font-semibold" disabled={claimState === 'claiming' || claimState === 'checking'} />
          {walletAddress && faucetAddress !== walletAddress && (
            <button onClick={() => setFaucetAddress(walletAddress)} className="px-3 text-xs font-bold tracking-[0.15em] uppercase text-neutral-500 hover:text-black transition-colors whitespace-nowrap">Use mine</button>
          )}
        </div>
        {addressError && <p className="text-xs font-bold text-red-500 mb-2">{addressError}</p>}
        {claimState === 'success' && claimResult?.signature && (
          <div className="mb-3 p-3 border-2 border-black bg-[#dddcd5]">
            <div className="flex items-center gap-2 mb-1">
              <svg className="w-4 h-4 text-black" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>
              <span className="text-xs font-bold text-black uppercase tracking-wider">0.3 SOL Sent!</span>
            </div>
            <a href={`https://solscan.io/tx/${claimResult.signature}?cluster=devnet`} target="_blank" rel="noopener noreferrer" className="text-xs font-bold text-neutral-600 hover:text-black hover:underline">TX: {claimResult.signature.slice(0, 8)}...{claimResult.signature.slice(-6)} ↗</a>
          </div>
        )}
        {claimState === 'cooldown' && claimResult && (
          <div className="mb-3 p-3 border-2 border-black bg-[#dddcd5]">
            <p className="text-xs font-bold text-neutral-600">Next claim in <span className="text-black">{claimResult.hoursRemaining}h</span></p>
          </div>
        )}
        {claimState === 'error' && claimResult?.errorMsg && (
          <div className="mb-3 p-3 border-2 border-red-500 bg-red-100">
            <p className="text-xs font-bold text-red-600">{claimResult.errorMsg}</p>
          </div>
        )}
        <button onClick={handleClaim} disabled={claimState === 'claiming' || claimState === 'checking' || !faucetStatus?.enabled || (faucetStatus?.balance ?? 0) < 0.3}
          className={`w-full py-3 text-sm font-bold tracking-wider uppercase border-2 transition-all mt-1 ${claimState === 'success' ? 'bg-[#dddcd5] border-black text-black cursor-default' : claimState === 'cooldown' ? 'bg-neutral-200 border-neutral-400 text-neutral-500 cursor-not-allowed' : 'bg-black border-black text-white hover:bg-neutral-800 disabled:opacity-50'}`}>
          {claimState === 'checking' && 'Checking...'}
          {claimState === 'claiming' && 'Sending 0.3 SOL...'}
          {claimState === 'success' && '✓ Claimed'}
          {claimState === 'cooldown' && `Cooldown ${claimResult?.hoursRemaining}h`}
          {claimState === 'error' && 'Try Again'}
          {claimState === 'idle' && 'Claim 0.3 SOL'}
        </button>
        <div className="mt-4 pt-4 border-t-2 border-dashed border-neutral-300 grid grid-cols-3 gap-2">
          <div className="text-center"><p className="text-base font-bold text-black">0.3</p><p className="text-[10px] font-bold tracking-[0.15em] uppercase text-neutral-500 mt-0.5">SOL</p></div>
          <div className="text-center border-x-2 border-dashed border-neutral-300"><p className="text-base font-bold text-black">6h</p><p className="text-[10px] font-bold tracking-[0.15em] uppercase text-neutral-500 mt-0.5">Cooldown</p></div>
          <div className="text-center"><p className="text-base font-bold text-black">Free</p><p className="text-[10px] font-bold tracking-[0.15em] uppercase text-neutral-500 mt-0.5">No signup</p></div>
        </div>
      </div>
      <div className="bg-[#dddcd5] border border-black p-3 rounded-none shadow-[2px_2px_0px_#000]">
        <p className="text-[11px] font-bold text-black leading-relaxed">Devnet SOL for testing only. No real value.</p>
      </div>
    </div>
  );
}; export default function Home() {
  const router = useRouter();
  const isLoggedIn = useIsLoggedIn();
  const { primaryWallet } = useDynamicContext();
  const userWallets = useUserWallets();
  const solanaWallet = userWallets.find(w => w.chain === 'SOL' || w.chain === 'SOLANA') || primaryWallet;
  const walletAddress: string | null = solanaWallet?.address ?? null;
  const isConnected = isLoggedIn && !!walletAddress;
  const connection = new Connection(RPC_URL, 'confirmed');

  const [walletTimeout, setWalletTimeout] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'send' | 'receive' | 'stealth' | 'messages' | 'history' | 'faucet'>('send');
  const [selectedPool, setSelectedPool] = useState(DENOMINATIONS[0]);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<{ type: 'success' | 'error' | 'info'; message: string } | null>(null);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [showRegister, setShowRegister] = useState(false);
  const [pseudoInput, setPseudoInput] = useState('');
  const [noteInput, setNoteInput] = useState('');
  const [noteExpiry, setNoteExpiry] = useState<'10m' | '1h' | '6h' | '24h' | 'never'>('24h');
  const [stealthMode, setStealthMode] = useState(false);
  const [sendHistory, setSendHistory] = useState<Array<{ id: string; to: string; amount: number; stealth: boolean; message?: string; timestamp: number; signature?: string }>>([]);
  const [stealthPayments, setStealthPayments] = useState<Array<{ id: string; amount: number; sender: string; ephemeralPub: string; stealthAddress: string; createdAt: string; encrypted_message?: string; sender_public_key?: string }>>([]);
  const [decryptedNotes, setDecryptedNotes] = useState<Record<string, string>>({});
  const [recipientPseudo, setRecipientPseudo] = useState('');
  const [pendingTransfers, setPendingTransfers] = useState<PendingTransfer[]>([]);
  const [agentStatus, setAgentStatus] = useState<any>(null);
  const [pendingWithdrawals, setPendingWithdrawals] = useState<WithdrawalState[]>([]);
  const [previousTransferCount, setPreviousTransferCount] = useState(0);
  const [withdrawAddress, setWithdrawAddress] = useState('');
  const [showWithdrawModal, setShowWithdrawModal] = useState<PendingTransfer | null>(null);
  const [successPopup, setSuccessPopup] = useState<{ amount: number; id: string } | null>(null);
  const [transactionProof, setTransactionProof] = useState<TransactionProof | null>(null);
  const [now, setNow] = useState(Date.now());
  const [savedMessages, setSavedMessages] = useState<Array<{ id: string; from: string; amount: number; text: string; expiresAt: number | null; totalDuration: number | null; receivedAt: number }>>([]);
  const [selectedAvatar, setSelectedAvatar] = useState<string>(DEFAULT_AVATARS[0]);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [showCropper, setShowCropper] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const notifiedIds = useRef<Set<string>>(new Set());
  const popupTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => { setMounted(true); const stored = localStorage.getItem('shadow_messages'); if (stored) { try { const p = JSON.parse(stored); const valid = p.filter((m: any) => !m.expiresAt || m.expiresAt > Date.now()); setSavedMessages(valid); localStorage.setItem('shadow_messages', JSON.stringify(valid)); } catch { } } }, []);
  useEffect(() => { if (!walletAddress) return; const h = localStorage.getItem(`shadow_history_${walletAddress}`); if (h) { try { setSendHistory(JSON.parse(h)); } catch { } } }, [walletAddress]);
  useEffect(() => { if (!isLoggedIn && mounted) { const t = setTimeout(() => { if (!isLoggedIn) { localStorage.removeItem('shadow_messages'); localStorage.removeItem(WITHDRAWALS_KEY); setSavedMessages([]); setStealthPayments([]); setPendingTransfers([]); setSendHistory([]); setCurrentUser(null); } }, 3000); return () => clearTimeout(t); } }, [isLoggedIn, mounted]);
  useEffect(() => { if (isLoggedIn && !walletAddress) { const t = setTimeout(() => setWalletTimeout(true), 5000); return () => clearTimeout(t); } else { setWalletTimeout(false); } }, [isLoggedIn, walletAddress]);
  useEffect(() => {
    const t = setInterval(() => {
      const now2 = Date.now(); setNow(now2);
      setSavedMessages(prev => {
        const expired = prev.filter(m => m.expiresAt && m.expiresAt <= now2);
        const valid = prev.filter(m => !m.expiresAt || m.expiresAt > now2);
        if (expired.length > 0) { localStorage.setItem('shadow_messages', JSON.stringify(valid)); try { const audio = new Audio('/vanish.mp3'); audio.volume = 0.7; audio.play().catch(() => { }); } catch { } }
        return valid;
      });
    }, 1000);
    return () => clearInterval(t);
  }, []);
  useEffect(() => { for (let i = 1; i <= 11; i++) localStorage.removeItem(`shadow_withdrawals_v${i}`); }, []);
  useEffect(() => { if (walletAddress) { loadUser(); checkAgent(); } else if (!isLoggedIn) { setCurrentUser(null); setShowRegister(false); } }, [walletAddress, isLoggedIn]);
  useEffect(() => { if (currentUser) { loadPendingTransfers(); const f = setInterval(updatePendingWithdrawals, 1000); const n = setInterval(() => { loadPendingTransfers(); checkAgent(); }, 3000); return () => { clearInterval(f); clearInterval(n); }; } }, [currentUser]);
  useEffect(() => { if (pendingTransfers.length > previousTransferCount && previousTransferCount > 0) { playSound('receive'); setStatus({ type: 'info', message: 'New payment received!' }); } setPreviousTransferCount(pendingTransfers.length); }, [pendingTransfers.length]);
  useEffect(() => { const stored = localStorage.getItem(WITHDRAWALS_KEY); if (stored) { try { const p = JSON.parse(stored); const r = p.filter((w: WithdrawalState) => { const a = Date.now() - (w.createdAt || 0); return (w.status === 'completed' || w.status === 'failed') ? a < 60000 : a < 600000; }); setPendingWithdrawals(r); r.forEach((w: WithdrawalState) => { if (w.notified) notifiedIds.current.add(w.id); }); } catch { setPendingWithdrawals([]); } } }, []);
  useEffect(() => { if (status) { const t = setTimeout(() => setStatus(null), 4000); return () => clearTimeout(t); } }, [status]);
  useEffect(() => { const expired = pendingWithdrawals.filter(w => (w.status === 'pending' || w.status === 'processing') && w.executeAt <= now && !w.notified); if (expired.length > 0) updatePendingWithdrawals(); }, [now, pendingWithdrawals]);

  const saveWithdrawals = useCallback((ws: WithdrawalState[]) => { setPendingWithdrawals(ws); localStorage.setItem(WITHDRAWALS_KEY, JSON.stringify(ws)); }, []);
  const checkAgent = async () => { try { const r = await fetch(`${AGENT_URL}/status`); setAgentStatus(await r.json()); } catch { setAgentStatus(null); } };

  const loadUser = async () => {
    if (!walletAddress) return;
    try {
      const { data, error } = await supabase.from('users').select('*').eq('wallet_address', walletAddress).single();
      if (error || !data) { setShowRegister(true); } else {
        let sk = localStorage.getItem(`shadow_sk_${walletAddress}`);
        if (!sk) { const kp = generateKeyPair(); sk = kp.secretKey; localStorage.setItem(`shadow_sk_${walletAddress}`, sk); }
        const currentPk = encodeBase64(nacl.box.keyPair.fromSecretKey(decodeBase64(sk)).publicKey);
        if (data.public_key !== currentPk) { await supabase.from('users').update({ public_key: currentPk }).eq('wallet_address', walletAddress); data.public_key = currentPk; }
        let scanSk = localStorage.getItem(`shadow_stealth_scan_${walletAddress}`); let spendSk = localStorage.getItem(`shadow_stealth_spend_${walletAddress}`);
        if (!scanSk || !spendSk) { const sk = generateStealthMetaKey(); scanSk = sk.scanSecret; spendSk = sk.spendSecret; localStorage.setItem(`shadow_stealth_scan_${walletAddress}`, scanSk); localStorage.setItem(`shadow_stealth_spend_${walletAddress}`, spendSk); }
        const scanPub = encodeBase64(nacl.box.keyPair.fromSecretKey(decodeBase64(scanSk)).publicKey);
        const spendPub = encodeBase64(nacl.box.keyPair.fromSecretKey(decodeBase64(spendSk)).publicKey);
        const metaKey = scanPub + ':' + spendPub;
        await fetch('/api/stealth/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ walletAddress, metaKey }) });
        (data as any).stealth_meta_key = metaKey;
        setCurrentUser(data); setShowRegister(false);
      }
    } catch { setShowRegister(true); }
  };

  const loadPendingTransfers = async () => {
    if (!currentUser) return;
    const { data } = await supabase.from('pending_transfers').select('*').eq('recipient_pseudo', currentUser.pseudo).eq('claimed', false).order('created_at', { ascending: false });
    if (data) {
      setPendingTransfers((data as any[]).filter((t: any) => !t.is_stealth));
      const scanSk = localStorage.getItem(`shadow_stealth_scan_${walletAddress}`);
      if (scanSk) { const stealthFound: typeof stealthPayments = []; for (const t of data as any[]) { if (t.is_stealth && t.stealth_address && t.stealth_ephemeral_pub) { try { const expected = scanStealthPayment(t.stealth_ephemeral_pub, scanSk, ''); if (expected === t.stealth_address) { stealthFound.push({ id: t.id, amount: t.amount, sender: 'anonymous', ephemeralPub: t.stealth_ephemeral_pub, stealthAddress: t.stealth_address, createdAt: t.created_at, encrypted_message: t.encrypted_message, sender_public_key: t.sender_public_key }); } } catch { } } } setStealthPayments(stealthFound); }
      const sk = localStorage.getItem(`shadow_sk_${walletAddress}`);
      if (sk) { const notes: Record<string, string> = {}; for (const t of data) { if (t.encrypted_message && t.sender_public_key) { const dec = decryptMessage(t.encrypted_message, t.sender_public_key, sk); if (dec) notes[t.id] = dec; } } setDecryptedNotes(notes);
        // Auto-save decrypted messages to Messages tab
        const newMsgs: typeof savedMessages = [];
        for (const t of data) {
          if (notes[t.id]) {
            const expiresAtMs = t.message_expires_at ? new Date(t.message_expires_at).getTime() : null;
            const totalDuration = expiresAtMs ? expiresAtMs - Date.now() : null;
            if (expiresAtMs && expiresAtMs <= Date.now()) continue;
            newMsgs.push({ id: t.id, from: t.sender_pseudo || 'unknown', amount: t.amount || 0, text: notes[t.id], expiresAt: expiresAtMs, totalDuration, receivedAt: Date.now() });
          }
        }
        if (newMsgs.length > 0) {
          setSavedMessages(prev => {
            const existingIds = new Set(prev.map(m => m.id));
            const toAdd = newMsgs.filter(m => !existingIds.has(m.id));
            if (toAdd.length === 0) return prev;
            const updated = [...prev, ...toAdd];
            localStorage.setItem('shadow_messages', JSON.stringify(updated));
            return updated;
          });
        }
      }
    }
  };

  const showSuccessNotification = useCallback((amount: number, id: string) => {
    if (notifiedIds.current.has(id)) return; notifiedIds.current.add(id);
    if (popupTimeoutRef.current) clearTimeout(popupTimeoutRef.current);
    playSound('success'); setSuccessPopup({ amount, id });
    popupTimeoutRef.current = setTimeout(() => setSuccessPopup(null), 3000);
  }, []);

  const updatePendingWithdrawals = useCallback(async () => {
    if (pendingWithdrawals.length === 0) return;
    const updated: WithdrawalState[] = []; let hasChanges = false;
    for (const w of pendingWithdrawals) {
      if ((w.status === 'completed' || w.status === 'failed') && w.notified) { if (Date.now() - (w.createdAt || 0) < 60000) updated.push(w); continue; }
      try {
        const res = await fetch(`${AGENT_URL}/withdraw/${w.id}`); const data = await res.json();
        if (data.status === 'completed' && !w.notified) { showSuccessNotification(w.amount, w.id); updated.push({ ...w, status: 'completed', signature: data.finalSignature, notified: true }); hasChanges = true; }
        else if (data.status === 'failed' && !w.notified) { updated.push({ ...w, status: 'failed', notified: true }); hasChanges = true; }
        else if (data.status !== w.status) { updated.push({ ...w, status: data.status, signature: data.finalSignature }); hasChanges = true; }
        else { updated.push(w); }
      } catch { updated.push(w); }
    }
    if (hasChanges || updated.length !== pendingWithdrawals.length) saveWithdrawals(updated);
  }, [pendingWithdrawals, saveWithdrawals, showSuccessNotification]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => { const file = e.target.files?.[0]; if (!file) return; if (!file.type.startsWith('image/')) { setStatus({ type: 'error', message: 'Select an image file' }); playSound('error'); return; } if (file.size > 5 * 1024 * 1024) { setStatus({ type: 'error', message: 'Max 5MB' }); playSound('error'); return; } setSelectedFile(file); setShowCropper(true); };
  const handleCropComplete = async (blob: Blob) => {
    if (!walletAddress) return; setShowCropper(false); setUploadingAvatar(true);
    try {
      const fileName = `${walletAddress}-${Date.now()}.jpg`;
      const { error } = await supabase.storage.from('avatars').upload(fileName, blob, { upsert: true, contentType: 'image/jpeg' });
      if (error) throw error;
      const { data: { publicUrl } } = supabase.storage.from('avatars').getPublicUrl(fileName);
      setSelectedAvatar(publicUrl); setStatus({ type: 'success', message: 'Avatar uploaded!' }); playSound('success');
    } catch { setStatus({ type: 'error', message: 'Upload failed' }); playSound('error'); }
    finally { setUploadingAvatar(false); setSelectedFile(null); }
  };

  const registerUser = async () => {
    if (!walletAddress || !pseudoInput.trim()) return;
    const pseudo = pseudoInput.trim().toLowerCase();
    if (pseudo.length < 3) { setStatus({ type: 'error', message: 'Min 3 characters' }); playSound('error'); return; }
    setLoading(true);
    try {
      const { data: existing } = await supabase.from('users').select('id').eq('pseudo', pseudo).maybeSingle();
      if (existing) { setStatus({ type: 'error', message: 'Username taken' }); playSound('error'); setLoading(false); return; }
      const kp = generateKeyPair(); localStorage.setItem(`shadow_sk_${walletAddress}`, kp.secretKey);
      const stealthKeys = generateStealthMetaKey(); localStorage.setItem(`shadow_stealth_scan_${walletAddress}`, stealthKeys.scanSecret); localStorage.setItem(`shadow_stealth_spend_${walletAddress}`, stealthKeys.spendSecret);
      const { data, error } = await supabase.from('users').insert([{ pseudo, wallet_address: walletAddress, avatar_url: selectedAvatar, public_key: kp.publicKey, stealth_meta_key: stealthKeys.metaKey }]).select().single();
      if (error) throw error;
      if (data) { setCurrentUser(data); setShowRegister(false); setStatus({ type: 'success', message: 'Welcome to Shadow Protocol' }); playSound('success'); }
    } catch (error: any) { setStatus({ type: 'error', message: error?.message || 'Registration failed' }); playSound('error'); }
    finally { setLoading(false); }
  };

  const handleSend = async () => {
    if (!walletAddress || !isConnected || !currentUser || !solanaWallet) return;
    const recipient = recipientPseudo.trim().toLowerCase().replace('@', '');
    if (!recipient) { setStatus({ type: 'error', message: 'Enter a recipient' }); playSound('error'); return; }
    if (recipient === currentUser.pseudo) { setStatus({ type: 'error', message: 'Cannot send to yourself' }); playSound('error'); return; }
    const { data: recipientUser } = await supabase.from('users').select('*').eq('pseudo', recipient).single();
    let stealthAddress: string | null = null; let ephemeralPub: string | null = null;
    if (stealthMode && (recipientUser as any)?.stealth_meta_key) { const ephemeralSecret = nacl.randomBytes(32); const stealth = generateStealthAddress((recipientUser as any).stealth_meta_key, ephemeralSecret); stealthAddress = stealth.address; ephemeralPub = stealth.ephemeralPub; }
    if (!recipientUser) { setStatus({ type: 'error', message: 'User not found' }); playSound('error'); return; }
    setLoading(true); setStatus({ type: 'info', message: 'Initializing transfer...' }); setTransactionProof(null);
    try {
      const secret = generateSecret(); const nullifier = generateNullifier();
      const note = createNote(selectedPool.id, selectedPool.value, secret, nullifier);
      try { const { buildPoseidon } = await import('circomlibjs'); const poseidon = await buildPoseidon(); const F = poseidon.F; const secretBigInt = BigInt('0x' + secret.slice(0, 32)); const nullifierBigInt = BigInt('0x' + nullifier.slice(0, 32)); const commitment = F.toObject(poseidon([secretBigInt, nullifierBigInt])); await fetch(`${AGENT_URL}/deposit`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ commitment: commitment.toString(), poolId: selectedPool.id }) }); } catch { }
      setStatus({ type: 'info', message: 'Confirm in wallet...' });
      const commitment = new Uint8Array(hexToBytes(secret.slice(0, 64)));
      const txData = Buffer.concat([Buffer.from(DISCRIMINATORS.deposit), Buffer.from(commitment)]);
      const instruction = new TransactionInstruction({ keys: [{ pubkey: selectedPool.poolPDA, isSigner: false, isWritable: true }, { pubkey: selectedPool.vaultPDA, isSigner: false, isWritable: true }, { pubkey: new PublicKey(walletAddress), isSigner: true, isWritable: true }, { pubkey: SystemProgram.programId, isSigner: false, isWritable: false }], programId: PROGRAM_ID, data: txData });
      const transaction = new Transaction().add(instruction);
      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
      transaction.recentBlockhash = blockhash; transaction.feePayer = new PublicKey(walletAddress);
      let signature: string;
      try {
        if (isSolanaWallet(solanaWallet) && typeof (solanaWallet as any).signAndSendTransaction === 'function') { const result = await (solanaWallet as any).signAndSendTransaction(transaction); signature = typeof result === 'string' ? result : result?.signature ?? result?.hash; }
        else if (isSolanaWallet(solanaWallet)) { const signer = await solanaWallet.getSigner(); const signedTx = await (signer as any).signTransaction(transaction as any); signature = await connection.sendRawTransaction(signedTx.serialize ? signedTx.serialize() : Buffer.from(signedTx.serializedTransaction ?? signedTx, 'base64')); }
        else { const signer = await (solanaWallet as any).connector?.getSigner?.(); if (!signer) throw new Error('Wallet signer not available'); const signedTx = await (signer as any).signTransaction(transaction as any); signature = await connection.sendRawTransaction(signedTx.serialize()); }
      } catch (signerErr: any) { if ((window as any).solana?.signAndSendTransaction) { const result = await (window as any).solana.signAndSendTransaction(transaction); signature = result.signature; } else { throw signerErr; } }
      setStatus({ type: 'info', message: 'Confirming...' });
      await connection.confirmTransaction({ signature, blockhash, lastValidBlockHeight });
      let encryptedMsg: string | null = null;
      if (noteInput.trim() && recipientUser.public_key) { let senderSk = localStorage.getItem(`shadow_sk_${walletAddress}`); if (!senderSk) { const kp = generateKeyPair(); senderSk = kp.secretKey; localStorage.setItem(`shadow_sk_${walletAddress}`, senderSk); await supabase.from('users').update({ public_key: kp.publicKey }).eq('wallet_address', walletAddress); } encryptedMsg = encryptMessage(noteInput.trim(), recipientUser.public_key, senderSk); }
      const senderPubKey = (currentUser as any).public_key || null;
      const expiryHours: Record<string, number | null> = { '10m': 1 / 6, '1h': 1, '6h': 6, '24h': 24, 'never': null };
      const expHours = expiryHours[noteExpiry];
      const message_expires_at = expHours ? new Date(Date.now() + expHours * 3600000).toISOString() : null;
      const { error: insertError } = await supabase.from('pending_transfers').insert([{ recipient_pseudo: recipient, encrypted_note: note, amount: selectedPool.value, sender_pseudo: stealthMode ? 'anonymous' : currentUser.pseudo, encrypted_message: encryptedMsg, sender_public_key: senderPubKey, message_expires_at, is_stealth: stealthMode, stealth_address: stealthAddress, stealth_ephemeral_pub: ephemeralPub }]);
      if (insertError) throw new Error(insertError.message);
      setNoteInput('');
      const histEntry = { id: Math.random().toString(36).slice(2), to: recipient, amount: selectedPool.value, stealth: stealthMode, message: noteInput.trim() || undefined, timestamp: Date.now(), signature };
      setSendHistory(prev => { const updated = [histEntry, ...prev].slice(0, 50); localStorage.setItem(`shadow_history_${walletAddress}`, JSON.stringify(updated)); return updated; });
      playSound('send');
      setTransactionProof({ signature, amount: selectedPool.value, recipient, timestamp: Date.now(), type: 'sent' });
      setStatus({ type: 'success', message: `Sent ${selectedPool.value} SOL to @${recipient}` });
      setRecipientPseudo('');
    } catch (error: any) { playSound('error'); setStatus({ type: 'error', message: error?.message || 'Transaction failed' }); }
    finally { setLoading(false); }
  };

  const handleWithdraw = async (transfer: PendingTransfer, customAddress?: string) => {
    if (!currentUser || !agentStatus) { setStatus({ type: 'error', message: 'Agent offline' }); playSound('error'); return; }
    setLoading(true); setStatus({ type: 'info', message: 'Generating ZK proof...' }); setShowWithdrawModal(null);
    try {
      const parsed = parseNote(transfer.encrypted_note); if (!parsed) throw new Error('Invalid note');
      const snarkjs = (await import('snarkjs')).default || await import('snarkjs');
      const { buildPoseidon } = await import('circomlibjs');
      const poseidon = await buildPoseidon(); const F = poseidon.F;
      const secretBigInt = BigInt('0x' + parsed.secret.slice(0, 32)); const nullifierBigInt = BigInt('0x' + parsed.nullifier.slice(0, 32));
      const commitment = F.toObject(poseidon([secretBigInt, nullifierBigInt]));
      const nullifierHash = F.toObject(poseidon([nullifierBigInt]));
      setStatus({ type: 'info', message: 'Fetching Merkle proof...' });
      const merkleRes = await fetch(`${AGENT_URL}/merkle-proof/${parsed.poolId}/${commitment.toString()}`);
      if (!merkleRes.ok) throw new Error('Deposit not found');
      const merkleData = await merkleRes.json();
      setStatus({ type: 'info', message: 'Creating proof...' });
      const { proof, publicSignals } = await snarkjs.groth16.fullProve({ secret: secretBigInt.toString(), nullifier: nullifierBigInt.toString(), pathElements: merkleData.pathElements, pathIndices: merkleData.pathIndices, root: merkleData.root, nullifierHash: nullifierHash.toString() }, '/zk/mixer.wasm', '/zk/mixer_final.zkey');
      setStatus({ type: 'info', message: 'Submitting to relay...' });
      const recipientAddress = customAddress || currentUser.wallet_address;
      const response = await fetch(`${AGENT_URL}/withdraw`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ proof, publicSignals, recipientAddress, poolId: parsed.poolId, amount: parsed.amount }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Withdrawal failed');
      await supabase.from('pending_transfers').update({ claimed: true }).eq('id', transfer.id);
      const newW: WithdrawalState = { id: result.id, amount: result.amount || parsed.amount, status: 'pending', executeAt: result.executeAt, createdAt: Date.now(), delay: result.delay, from: transfer.sender_pseudo || undefined, notified: false, is_stealth: (transfer as any).is_stealth || false };
      saveWithdrawals([...pendingWithdrawals, newW]);
      loadPendingTransfers();
      playSound('send');
      if ((transfer as any).is_stealth) { setStealthPayments(prev => prev.filter(sp => sp.id !== transfer.id)); }
      const t = transfer as any;
      if (t.encrypted_message) {
        const sk = localStorage.getItem(`shadow_sk_${walletAddress}`);
        if (sk && t.sender_public_key) {
          const dec = decryptMessage(t.encrypted_message, t.sender_public_key, sk);
          if (dec) {
            const expiresAtMs = t.message_expires_at ? new Date(t.message_expires_at).getTime() : null;
            const withdrawTime = Date.now();
            const totalDuration = expiresAtMs ? expiresAtMs - withdrawTime : null;
            const newMsg = { id: t.id, from: t.sender_pseudo || 'unknown', amount: t.amount || 0, text: dec, expiresAt: expiresAtMs, totalDuration, receivedAt: withdrawTime };
            setSavedMessages(prev => {
              if (prev.find(m => m.id === newMsg.id)) return prev;
              const updated = [...prev, newMsg];
              localStorage.setItem('shadow_messages', JSON.stringify(updated));
              return updated;
            });
          }
        }
      }
      setStatus({ type: 'success', message: `Withdrawal scheduled (${result.delayFormatted})` });
      setWithdrawAddress('');
    } catch (error: any) { playSound('error'); setStatus({ type: 'error', message: error?.message || 'Withdrawal failed' }); }
    finally { setLoading(false); }
  };

  const formatTime = (ms: number) => { if (ms <= 0) return 'Sending...'; const s = Math.ceil(ms / 1000); return `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`; };

  if (!mounted) return null;

  const isWalletLoading = isLoggedIn && !walletAddress && !walletTimeout;

  if (isWalletLoading) {
    return (
      <div className="min-h-screen bg-[#dddcd5] text-black flex items-center justify-center">
        <AnimatedBackground />
        <div className="relative z-10 text-center px-6">
          <div className="flex items-center justify-center gap-2 mb-5">
            <div className="w-2 h-2 bg-black rounded-full animate-ping" />
            <div className="w-2 h-2 bg-black rounded-full animate-ping" style={{ animationDelay: '0.2s' }} />
            <div className="w-2 h-2 bg-black rounded-full animate-ping" style={{ animationDelay: '0.4s' }} />
          </div>
          <p className="text-sm font-bold tracking-[0.3em] uppercase text-black mb-2">Initializing wallet...</p>
          <p className="text-xs font-semibold tracking-[0.2em] uppercase text-neutral-500">Setting up your embedded wallet</p>
        </div>
      </div>
    );
  }

  if (isConnected && showRegister) {
    return (
      <div className="min-h-screen bg-[#dddcd5] text-black flex items-center justify-center p-4 relative overflow-hidden">
        <AnimatedBackground />
        {showCropper && selectedFile && (<ImageCropperModal imageFile={selectedFile} onCropComplete={handleCropComplete} onCancel={() => { setShowCropper(false); setSelectedFile(null); }} />)}
        <div className="w-full max-w-md relative z-10">
          <div className="bg-white p-8 border-2 border-black shadow-[8px_8px_0px_#000]">
            <div className="flex items-center justify-center gap-2 mb-6">
              <img src="/logox.png" alt="Shadow" className="w-14 h-14 object-contain filter invert" />
              <span className="text-black font-bold tracking-widest uppercase text-lg">Shadow</span>
            </div>
            <h1 className="text-xl font-bold tracking-[0.1em] uppercase text-black text-center mb-1">Create Identity</h1>
            <p className="text-sm font-semibold text-neutral-500 text-center mb-6">Choose your avatar and username</p>
            {walletAddress && (
              <div className="mb-5 p-3 bg-[#f0ece1] border border-black shadow-[2px_2px_0px_#000]">
                <p className="text-xs font-bold tracking-[0.15em] uppercase text-black mb-1">Your wallet</p>
                <p className="text-sm font-semibold text-neutral-600 font-mono truncate">{walletAddress.slice(0, 20)}...{walletAddress.slice(-8)}</p>
              </div>
            )}
            <div className="mb-5">
              <div className="flex justify-center mb-4">
                <div className="w-24 h-24 rounded-none border-4 border-black shadow-[4px_4px_0px_#000] overflow-hidden bg-white">
                  <img src={selectedAvatar} alt="Avatar" className="w-full h-full object-cover" />
                </div>
              </div>
              <div className="grid grid-cols-6 gap-2 mb-3">
                {DEFAULT_AVATARS.map((avatar, i) => (
                  <button key={i} onClick={() => setSelectedAvatar(avatar)} className={`w-full aspect-square border-2 transition-all ${selectedAvatar === avatar ? 'border-black scale-110 shadow-[2px_2px_0px_#000]' : 'border-neutral-300 hover:border-black'}`}>
                    <img src={avatar} alt={`Avatar ${i + 1}`} className="w-full h-full object-cover" />
                  </button>
                ))}
              </div>
              <input ref={fileInputRef} type="file" accept="image/*" onChange={handleFileSelect} className="hidden" />
              <button onClick={() => fileInputRef.current?.click()} disabled={uploadingAvatar} className="w-full py-2 bg-[#dddcd5] border border-black shadow-[2px_2px_0px_#000] text-xs font-bold tracking-[0.2em] uppercase text-black hover:bg-neutral-300 transition-all disabled:opacity-50">{uploadingAvatar ? 'Uploading...' : 'Upload Custom Image'}</button>
            </div>
            <div className="mb-5">
              <div className="flex items-center border-2 border-black bg-[#f0ece1] hover:bg-white transition-colors">
                <span className="text-lg text-black pl-4 pr-2 font-bold">@</span>
                <input type="text" value={pseudoInput} onChange={(e) => setPseudoInput(e.target.value.replace(/[^a-zA-Z0-9_]/g, '').toLowerCase())} onKeyDown={(e) => e.key === 'Enter' && registerUser()} placeholder="username" className="flex-1 bg-transparent py-4 pr-4 text-base font-bold text-black placeholder-neutral-400 outline-none font-mono" maxLength={20} />
              </div>
              <p className="text-xs font-semibold text-neutral-500 mt-1.5">Others send you SOL using only this username.</p>
            </div>
            <button onClick={registerUser} disabled={loading || pseudoInput.length < 3} className="w-full py-4 bg-black text-white text-sm font-bold tracking-widest uppercase shadow-[4px_4px_0px_#000] disabled:opacity-50 hover:bg-neutral-800 transition-all border-2 border-black">{loading ? 'Creating...' : 'Create Identity'}</button>
          </div>
        </div>
        {status && (
          <div className={`fixed bottom-5 left-5 right-5 max-w-md mx-auto p-3 z-40 border-2 shadow-[4px_4px_0px_#000] ${status.type === 'error' ? 'bg-red-100 border-red-500' : 'bg-white border-black'}`}>
            <p className={`text-xs text-center font-bold tracking-wider uppercase ${status.type === 'error' ? 'text-red-600' : 'text-black'}`}>{status.message}</p>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="text-[#1a1a1a] relative flex flex-col min-h-screen bg-[#dddcd5] overflow-x-hidden">
      <AnimatedBackground />

      {successPopup && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-xl p-4" onClick={() => setSuccessPopup(null)}>
          <div className="bg-white p-8 text-center border-2 border-black shadow-[8px_8px_0px_#000] w-full max-w-[300px]">
            <div className="w-16 h-16 mx-auto mb-5 bg-[#dddcd5] border-2 border-black flex items-center justify-center shadow-[2px_2px_0px_#000] md:shadow-[4px_4px_0px_#000]">
              <svg className="w-8 h-8 text-black" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>
            </div>
            <h2 className="text-lg font-bold tracking-wider uppercase text-black mb-2">Withdraw Successful</h2>
            <p className="text-sm font-semibold text-neutral-600">{successPopup.amount} SOL received!</p>
          </div>
        </div>
      )}

      {showWithdrawModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-white/40 backdrop-blur-md p-4">
          <div className="bg-white p-6 w-full max-w-md border-2 border-black shadow-[8px_8px_0px_#000]">
            <h2 className="text-lg font-bold tracking-wider uppercase text-black mb-1">Withdraw {showWithdrawModal.amount} SOL</h2>
            <p className="text-sm font-semibold text-neutral-500 mb-5">From @{showWithdrawModal.sender_pseudo}</p>
            <div className="mb-5">
              <span className="text-xs tracking-[0.2em] uppercase text-black mb-2 block font-bold">Destination</span>
              <input type="text" value={withdrawAddress} onChange={(e) => setWithdrawAddress(e.target.value)} placeholder={`Leave empty → your wallet (${walletAddress?.slice(0, 10)}...)`} className="w-full p-4 bg-[#f0ece1] border-2 border-black text-sm text-black placeholder-neutral-400 outline-none hover:bg-white focus:bg-white transition-colors font-mono font-bold" />
            </div>
            <div className="flex gap-3">
              <button onClick={() => setShowWithdrawModal(null)} className="flex-1 py-3 bg-[#dddcd5] border-2 border-black text-sm font-bold tracking-widest uppercase text-black hover:bg-neutral-300 transition-all">Cancel</button>
              <button onClick={() => handleWithdraw(showWithdrawModal, withdrawAddress || undefined)} disabled={loading} className="flex-1 py-3 bg-black border-2 border-black text-white text-sm font-bold tracking-widest uppercase shadow-[4px_4px_0px_#000] hover:bg-neutral-800 disabled:opacity-50 transition-all">{loading ? 'Processing...' : 'Withdraw'}</button>
            </div>
          </div>
        </div>
      )}

      {/* Header Content */}
      <header className="relative z-50 flex items-center px-4 md:px-6 lg:px-10 py-3 w-full border-b border-[#0a0a0a] bg-[#0a0a0a] gap-6 lg:gap-10">
        <div className="flex items-center">
          <div className="flex items-center gap-4 opacity-90 hover:opacity-100 transition-opacity cursor-pointer" onClick={() => window.location.href = '/'}>
            <div className="relative w-32 h-32 -ml-2 -my-6">
              {/* @ts-ignore */}
              <img
                src="/logox.png"
                alt="Shadow Protocol Logo"
                className="w-full h-full object-contain drop-shadow-[0_0_10px_rgba(176,38,255,0.4)]"
              />
            </div>
          </div>
        </div>
        <nav className="hidden md:flex items-center gap-10">
          <a href="/" className="text-xs font-hud tracking-[0.2em] text-[#a1a39b] hover:text-[#b026ff] transition-colors">PLATFORM +</a>
          <a href="/main" className="text-xs font-hud tracking-[0.2em] font-semibold text-white hover:text-[#b026ff] transition-colors">APP +</a>
          <a href="/deadman" className="text-xs font-hud tracking-[0.2em] text-[#a1a39b] hover:text-[#b026ff] transition-colors">DEAD +</a>
          <a href="/docs" className="text-xs font-hud tracking-[0.2em] text-[#a1a39b] hover:text-[#b026ff] transition-colors">DOC +</a>
        </nav>
        <div className="hidden md:flex items-center gap-3 ml-auto">
          {isConnected && currentUser && (
            <div className="flex items-center gap-2 px-3 py-1.5 border border-[#333] bg-[#1a1a1a] rounded-sm">
              {currentUser.avatar_url && (
                <div className="w-5 h-5 overflow-hidden rounded-sm grayscale">
                  <img src={currentUser.avatar_url} alt="Avatar" className="w-full h-full object-cover" />
                </div>
              )}
              <span className="text-[10px] font-mono tracking-widest text-[#a1a39b] uppercase">@{currentUser.pseudo}</span>
            </div>
          )}
          <div className="scale-90 origin-right">
            <DynamicWidget />
          </div>
        </div>
        <button onClick={() => setMenuOpen(!menuOpen)} className="md:hidden ml-auto w-10 h-10 flex items-center justify-center text-white">
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            {menuOpen ? <path strokeLinecap="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /> : <path strokeLinecap="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />}
          </svg>
        </button>
      </header>

      {/* Mobile Menu */}
      {menuOpen && (
        <div className="md:hidden relative z-50 bg-[#0a0a0a] border-b border-[#333] p-6">
          <nav className="flex flex-col gap-6 mb-6 pb-6 border-b border-[#333]">
            <a href="/" className="text-xs font-hud tracking-[0.2em] font-semibold text-white">PLATFORM +</a>
            <a href="/main" className="text-xs font-hud tracking-[0.2em] text-[#a1a39b]">APP +</a>
            <a href="/deadman" className="text-xs font-hud tracking-[0.2em] text-[#a1a39b]">DEAD +</a>
            <a href="/docs" className="text-xs font-hud tracking-[0.2em] text-[#a1a39b]">DOC +</a>
          </nav>
          {currentUser && (
            <div className="flex items-center gap-2 px-3 py-1.5 border border-[#333] bg-[#1a1a1a] rounded-sm mb-4">
              {currentUser.avatar_url && (
                <div className="w-5 h-5 overflow-hidden rounded-sm grayscale">
                  <img src={currentUser.avatar_url} alt="Avatar" className="w-full h-full object-cover" />
                </div>
              )}
              <span className="text-[10px] font-mono tracking-widest text-[#a1a39b] uppercase">@{currentUser.pseudo}</span>
            </div>
          )}
          <div className="scale-90 origin-left">
            <DynamicWidget />
          </div>
        </div>
      )}

      {/* User Status / Top Right */}


      <main className="relative z-10 max-w-7xl mx-auto px-2 sm:px-4 md:px-6 py-4 md:py-6 w-full box-border">
        {!isConnected ? (
          <div className="flex flex-col items-center justify-center min-h-[60vh] text-center">
            <div className="inline-flex items-center gap-2 bg-white border-2 border-black px-4 py-2 mb-6 shadow-[2px_2px_0px_#000] md:shadow-[4px_4px_0px_#000]">
              <span className="text-xs text-black font-bold uppercase tracking-widest">Private · Secure · Untraceable</span>
            </div>
            <h1 className="text-4xl md:text-5xl lg:text-7xl font-bold uppercase tracking-[0.15em] leading-[1.1] mb-6 drop-shadow-md">
              <span className="text-black">Shadow Protocol</span>
              <br />
              <span className="text-black inline-block mt-4 bg-[#dddcd5] border-4 border-black px-6 py-2 shadow-[8px_8px_0px_#000]">App</span>
            </h1>
            <p className="text-base md:text-lg text-neutral-600 font-semibold leading-relaxed mb-10 max-w-lg">Connect your wallet to send and receive private transactions on Solana with ZK-SNARK privacy.</p>
            <div className="mb-12 scale-110 drop-shadow-[2px_2px_0px_#000] md:shadow-[4px_4px_0px_#000]"><DynamicWidget /></div>
            <div className="grid md:grid-cols-3 gap-6 max-w-4xl w-full">
              {[
                { title: 'ZK-SNARK Privacy', desc: 'Groth16 proofs ensure complete anonymity' },
                { title: 'Stealth Addresses', desc: 'One-time addresses via ECDH' },
                { title: 'Encrypted Messages', desc: 'E2E encrypted notes with transfers' },
              ].map((f, i) => (
                <div key={i} className="bg-white border-2 border-black shadow-[4px_4px_0px_#000] p-6 hover:-translate-y-1 hover:shadow-[6px_6px_0px_#000] transition-all">
                  <h3 className="text-sm font-bold text-black uppercase tracking-wider mb-2">{f.title}</h3>
                  <p className="text-xs font-semibold text-neutral-600 leading-relaxed">{f.desc}</p>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="flex flex-col lg:flex-row gap-6 lg:gap-10 items-start">
            <div className="w-full lg:max-w-[620px] flex-shrink-0 min-w-0">
              {/* Tabs */}
              <div className="flex mb-4 md:mb-6 bg-[#f0ece1] border border-black md:border-2 shadow-none md:shadow-[4px_4px_0px_#000] overflow-x-auto p-1 md:p-1.5 gap-1 scrollbar-none">
                {[
                  { id: 'send', label: 'Send', badge: 0 },
                  { id: 'receive', label: 'Receive', badge: pendingTransfers.length },
                  { id: 'stealth', label: 'Stealth', badge: stealthPayments.length },
                  { id: 'messages', label: 'Messages', badge: savedMessages.length },
                  { id: 'history', label: 'History', badge: 0 },
                  { id: 'faucet', label: 'Faucet', badge: 0 },
                ].map(tab => (
                  <button key={tab.id} onClick={() => setActiveTab(tab.id as any)}
                    className={`flex-1 py-2 md:py-3 px-1.5 md:px-2 text-[9px] md:text-[11px] whitespace-nowrap font-bold tracking-widest uppercase transition-all duration-200 relative hover:scale-[1.02] border-2 border-transparent ${activeTab === tab.id ? 'bg-black text-white shadow-[2px_2px_0px_#888]' : 'text-neutral-500 hover:text-black hover:bg-white hover:border-black'}`}>
                    {tab.label}
                    {tab.badge > 0 && <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 border border-black shadow-[1px_1px_0px_#000]" />}
                  </button>
                ))}
              </div>

              {/* Send Tab */}
              {activeTab === 'send' && (
                <div className="space-y-6">
                  <div className="bg-white p-4 md:p-6 border-2 border-black shadow-[2px_2px_0px_#000] md:shadow-[2px_2px_0px_#000] md:shadow-[4px_4px_0px_#000]">
                    <span className="text-xs font-bold tracking-[0.2em] uppercase text-black mb-4 block">Amount</span>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-2 md:gap-3">
                      {DENOMINATIONS.map((d) => (
                        <button key={d.id} onClick={() => setSelectedPool(d)}
                          className={`py-3 md:py-4 px-2 text-sm md:text-base font-bold tracking-wider rounded-none border-2 transition-all ${selectedPool.id === d.id ? 'bg-black text-white border-black shadow-[4px_4px_0px_#888] scale-105' : 'bg-[#f0ece1] border-neutral-300 text-neutral-500 hover:border-black hover:text-black hover:bg-white'}`}>
                          {d.value} SOL
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="bg-white p-4 md:p-6 border-2 border-black shadow-[2px_2px_0px_#000] md:shadow-[2px_2px_0px_#000] md:shadow-[4px_4px_0px_#000]">
                    <span className="text-xs font-bold tracking-[0.2em] uppercase text-black mb-4 block">Recipient</span>
                    <div className="flex items-center border-2 border-black bg-[#f0ece1] hover:bg-white transition-colors">
                      <span className="text-lg text-black pl-5 pr-2 font-bold">@</span>
                      <input type="text" value={recipientPseudo} onChange={(e) => setRecipientPseudo(e.target.value.replace(/[^a-zA-Z0-9_]/g, '').toLowerCase())} onKeyDown={(e) => e.key === 'Enter' && handleSend()} placeholder="username" className="flex-1 bg-transparent py-4 pr-5 text-base font-bold text-black placeholder-neutral-400 outline-none font-mono" />
                    </div>
                  </div>
                  <div className="bg-white p-4 md:p-6 border-2 border-black shadow-[2px_2px_0px_#000] md:shadow-[2px_2px_0px_#000] md:shadow-[4px_4px_0px_#000]">
                    <div className="flex items-center justify-between mb-4">
                      <span className="text-xs font-bold tracking-[0.2em] uppercase text-black">Encrypted Message</span>
                      <span className="text-[9px] md:text-[10px] font-bold tracking-wider md:tracking-widest uppercase text-neutral-400">optional</span>
                    </div>
                    <textarea value={noteInput} onChange={(e) => setNoteInput(e.target.value)} placeholder="Private message for recipient..." rows={3} className="w-full bg-[#f0ece1] border-2 border-black p-4 text-sm font-bold text-black placeholder-neutral-400 outline-none hover:bg-white focus:bg-white resize-none mb-4 transition-colors font-mono" />
                    <div className="flex gap-1.5 md:gap-2 flex-wrap">
                      {(['10m', '1h', '6h', '24h', 'never'] as const).map(exp => (
                        <button key={exp} onClick={() => setNoteExpiry(exp)} className={`px-4 py-2 text-[11px] font-bold tracking-widest uppercase border-2 transition-all ${noteExpiry === exp ? 'bg-black text-white border-black shadow-[2px_2px_0px_#888]' : 'bg-[#f0ece1] border-neutral-300 text-neutral-500 hover:border-black hover:text-black hover:bg-white'}`}>{exp}</button>
                      ))}
                    </div>
                  </div>
                  <div className="bg-white p-4 md:p-5 border-2 border-black shadow-[2px_2px_0px_#000] md:shadow-[2px_2px_0px_#000] md:shadow-[4px_4px_0px_#000]">
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="text-sm font-bold tracking-wider uppercase text-black">Stealth Mode</span>
                        <p className="text-xs font-semibold text-neutral-500 mt-1">Hide your identity from recipient</p>
                      </div>
                      <button onClick={() => setStealthMode(!stealthMode)} className={`w-14 h-7 border-2 border-black transition-all relative ${stealthMode ? 'bg-black' : 'bg-[#dddcd5]'}`}>
                        <div className={`absolute top-[1px] w-5 h-5 bg-white border-2 border-black transition-all ${stealthMode ? 'left-7 bg-white' : 'left-[1px]'}`} />
                      </button>
                    </div>
                  </div>
                  {transactionProof && (
                    <div className="bg-white border-2 border-[#22C55E] shadow-[4px_4px_0px_#22C55E] p-5">
                      <div className="flex items-center gap-2 mb-2">
                        <svg className="w-5 h-5 text-[#22C55E]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>
                        <span className="text-sm font-bold tracking-wider text-[#22C55E] uppercase">Transaction sent</span>
                      </div>
                      <a href={`https://explorer.solana.com/tx/${transactionProof.signature}?cluster=devnet`} target="_blank" rel="noopener noreferrer" className="text-xs font-bold text-neutral-600 hover:text-black font-mono hover:underline">TX: {transactionProof.signature.slice(0, 16)}... ↗</a>
                    </div>
                  )}
                  <button onClick={handleSend} disabled={loading || !isConnected || !agentStatus}
                    className="w-full py-4 md:py-5 bg-black text-white text-sm md:text-base font-bold tracking-widest uppercase border-2 md:border-4 border-black shadow-[2px_2px_0px_#000] md:shadow-[6px_6px_0px_#000] hover:translate-y-1 hover:shadow-[2px_2px_0px_#000] hover:bg-neutral-800 disabled:opacity-40 disabled:cursor-not-allowed transition-all">
                    {loading ? 'Processing...' : `Send ${selectedPool.value} SOL`}
                  </button>
                  {!agentStatus && <p className="text-xs font-bold text-red-500 text-center uppercase tracking-widest">Agent offline — transfers unavailable</p>}
                </div>
              )}

              {/* Receive Tab */}
              {activeTab === 'receive' && (
                <div className="space-y-6">
                  {pendingTransfers.length > 0 && (
                    <div className="bg-white p-4 md:p-6 border-2 border-black shadow-[2px_2px_0px_#000] md:shadow-[2px_2px_0px_#000] md:shadow-[4px_4px_0px_#000]">
                      <span className="text-xs font-bold tracking-[0.2em] uppercase text-[#22C55E] mb-4 block">Incoming Payments</span>
                      <div className="space-y-4">
                        {pendingTransfers.map((t) => (
                          <div key={t.id} className="bg-[#f0ece1] p-5 border-2 border-black shadow-[4px_4px_0px_#000] hover:-translate-y-1 hover:shadow-[6px_6px_0px_#000] transition-all">
                            <div className="flex justify-between items-center mb-4">
                              <div><span className="text-2xl font-bold text-[#22C55E]">{t.amount}</span><span className="text-sm font-bold text-neutral-500 ml-2">SOL</span></div>
                              <span className="text-xs font-semibold text-neutral-500">from @{t.sender_pseudo}</span>
                            </div>
                            {decryptedNotes[t.id] && (
                              <div className="mb-4 p-4 border-2 border-[#38BDF8] bg-white">
                                <p className="text-[10px] font-bold tracking-widest uppercase text-[#38BDF8] mb-2">🔒 Private message</p>
                                <p className="text-sm font-semibold text-neutral-700">
                                  {decryptedNotes[t.id]}
                                </p>
                              </div>
                            )}
                            {t.encrypted_note?.startsWith('dead_man_') ? (
                              <button onClick={async () => { await supabase.from('pending_transfers').update({ claimed: true, claimed_at: new Date().toISOString() }).eq('id', t.id); setPendingTransfers(prev => prev.filter(x => x.id !== t.id)); const msg = { id: t.id, from: t.sender_pseudo || 'Dead Man Switch', text: (t as any).encrypted_message || '💀 Dead Man Switch triggered', amount: t.amount, expiresAt: null, totalDuration: null, receivedAt: Date.now() }; setSavedMessages(prev => { if (prev.find(m => m.id === msg.id)) return prev; const updated = [...prev, msg]; localStorage.setItem('shadow_messages', JSON.stringify(updated)); return updated; }); }}
                                className="w-full py-4 bg-red-100 border-2 border-red-500 text-red-600 text-sm font-bold tracking-widest uppercase shadow-[4px_4px_0px_#ef4444] hover:bg-red-200 transition-all">
                                💀 Acknowledge — Dead Man's Switch Triggered
                              </button>
                            ) : (
                              <button onClick={() => { setShowWithdrawModal(t); setWithdrawAddress(''); }} disabled={loading || !agentStatus}
                                className="w-full py-4 bg-[#22C55E] border-2 border-black text-black text-sm font-bold tracking-widest uppercase shadow-[4px_4px_0px_#000] hover:bg-[#16A34A] disabled:opacity-50 transition-all">Withdraw</button>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {pendingWithdrawals.filter(w => (w.status === 'pending' || w.status === 'processing') && !(w as any).is_stealth).length > 0 && (
                    <div className="bg-white p-4 md:p-6 border-2 border-black shadow-[2px_2px_0px_#000] md:shadow-[2px_2px_0px_#000] md:shadow-[4px_4px_0px_#000]">
                      <span className="text-xs font-bold tracking-[0.2em] uppercase text-[#22C55E] mb-4 block">Processing</span>
                      <div className="space-y-4">
                        {pendingWithdrawals.filter(w => (w.status === 'pending' || w.status === 'processing') && !(w as any).is_stealth).map(w => {
                          const timeLeft = Math.max(0, w.executeAt - now);
                          const progress = Math.min(100, ((w.delay || 60000) - timeLeft) / (w.delay || 60000) * 100);
                          return (
                            <div key={w.id} className="border-2 border-black bg-[#f0ece1] shadow-[2px_2px_0px_#000] rounded-none p-5">
                              <div className="flex justify-between items-center mb-4">
                                <div><span className="text-xl font-bold text-[#22C55E]">{w.amount}</span><span className="text-sm font-bold text-neutral-500 ml-2">SOL</span>{w.from && <span className="text-xs font-semibold text-neutral-500 ml-2">@{w.from}</span>}</div>
                                <div className="text-right"><span className="text-xl font-bold text-[#22C55E]">{formatTime(timeLeft)}</span><p className="text-[10px] uppercase font-bold text-neutral-400">{w.status}</p></div>
                              </div>
                              <div className="h-2 bg-neutral-300 border border-black"><div className="h-full bg-[#22C55E] border-r border-black transition-all duration-1000" style={{ width: `${progress}%` }} /></div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                  {pendingWithdrawals.filter(w => w.status === 'completed').length > 0 && (
                    <div className="bg-[#f0ece1] p-5 border-2 border-black shadow-[2px_2px_0px_#000] md:shadow-[2px_2px_0px_#000] md:shadow-[4px_4px_0px_#000]">
                      <span className="text-xs font-bold tracking-widest uppercase text-[#22C55E] mb-4 block">Recent</span>
                      <div className="space-y-3">
                        {pendingWithdrawals.filter(w => w.status === 'completed').map(w => (
                          <div key={w.id} className="flex justify-between items-center py-3 border-b-2 border-dashed border-neutral-300 last:border-0">
                            <div className="flex items-center gap-3">
                              <span className="text-sm font-bold text-[#22C55E]">{w.amount} SOL</span>
                              <span className="text-[10px] font-bold tracking-widest uppercase text-[#22C55E] px-2 py-1 bg-white border-2 border-[#22C55E] shadow-[2px_2px_0px_#22C55E]">✓ Done</span>
                            </div>
                            {w.signature && <a href={`https://solscan.io/tx/${w.signature}?cluster=devnet`} target="_blank" rel="noopener noreferrer" className="text-xs font-bold font-mono text-neutral-500 hover:text-black hover:underline">{w.signature.slice(0, 4)}... ↗</a>}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {pendingTransfers.length === 0 && pendingWithdrawals.filter(w => w.status !== 'completed' && w.status !== 'failed').length === 0 && (
                    <div className="bg-white p-10 text-center border-2 border-black shadow-[2px_2px_0px_#000] md:shadow-[2px_2px_0px_#000] md:shadow-[4px_4px_0px_#000]">
                      <div className="w-16 h-16 mx-auto mb-5 bg-[#f0ece1] border-2 border-black shadow-[4px_4px_0px_#000] flex items-center justify-center">
                        <svg className="w-8 h-8 text-neutral-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeWidth={2} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" /></svg>
                      </div>
                      <p className="text-sm font-bold tracking-widest uppercase text-neutral-500 mb-4">No incoming payments</p>
                      {currentUser && <div className="inline-block px-5 py-2.5 border-2 border-neutral-300 bg-white shadow-[2px_2px_0px_#000]"><span className="text-sm font-bold tracking-widest uppercase text-black">@{currentUser.pseudo}</span></div>}
                    </div>
                  )}
                </div>
              )}

              {/* Stealth Tab */}
              {activeTab === 'stealth' && (
                <div className="space-y-6">
                  {pendingWithdrawals.filter(w => (w.status === 'pending' || w.status === 'processing') && (w as any).is_stealth).length > 0 && (
                    <div className="bg-white p-4 md:p-6 border-2 border-[#8B5CF6] shadow-[4px_4px_0px_#8B5CF6]">
                      <span className="text-xs font-bold tracking-[0.2em] uppercase text-[#8B5CF6] mb-4 block">Processing</span>
                      <div className="space-y-4">
                        {pendingWithdrawals.filter(w => (w.status === 'pending' || w.status === 'processing') && (w as any).is_stealth).map(w => {
                          const timeLeft = Math.max(0, w.executeAt - now);
                          const progress = Math.min(100, ((w.delay || 60000) - timeLeft) / (w.delay || 60000) * 100);
                          return (
                            <div key={w.id} className="border-2 border-[#8B5CF6] bg-[#f0ece1] p-5 shadow-[2px_2px_0px_#8B5CF6]">
                              <div className="flex justify-between items-center mb-4">
                                <div><span className="text-xl font-bold text-[#8B5CF6]">{w.amount}</span><span className="text-sm font-bold text-neutral-500 ml-2">SOL</span><span className="text-xs font-semibold text-neutral-400 ml-2">@anonymous</span></div>
                                <span className="text-xl font-bold text-[#8B5CF6]">{formatTime(timeLeft)}</span>
                              </div>
                              <div className="h-2 bg-neutral-300 border border-[#8B5CF6]"><div className="h-full bg-[#8B5CF6] border-r border-[#8B5CF6] transition-all duration-1000" style={{ width: `${progress}%` }} /></div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                  {stealthPayments.length === 0 && pendingWithdrawals.filter(w => (w as any).is_stealth && (w.status === 'pending' || w.status === 'processing')).length === 0 ? (
                    <div className="bg-white p-10 text-center border-2 border-black shadow-[2px_2px_0px_#000] md:shadow-[2px_2px_0px_#000] md:shadow-[4px_4px_0px_#000]">
                      <p className="text-sm font-bold tracking-widest uppercase text-[#8B5CF6]">No stealth payments</p>
                      <p className="text-xs font-semibold text-neutral-500 mt-2 block">Anonymous payments appear here</p>
                    </div>
                  ) : stealthPayments.length > 0 && (
                    <div className="bg-white p-4 md:p-6 border-2 border-black shadow-[2px_2px_0px_#000] md:shadow-[2px_2px_0px_#000] md:shadow-[4px_4px_0px_#000]">
                      <span className="text-xs font-bold tracking-[0.2em] uppercase text-[#8B5CF6] mb-4 block">Stealth Payments</span>
                      <div className="space-y-4">
                        {stealthPayments.map((sp) => (
                          <div key={sp.id} className="border-2 border-black bg-[#f0ece1] p-5 shadow-[4px_4px_0px_#000] hover:-translate-y-1 hover:shadow-[6px_6px_0px_#000] transition-all">
                            <div className="flex justify-between items-center mb-3">
                              <div><span className="text-xl font-bold text-[#8B5CF6]">{sp.amount}</span><span className="text-sm font-bold text-neutral-500 ml-2">SOL</span></div>
                              <span className="text-xs font-semibold text-neutral-500">anonymous</span>
                            </div>
                            {sp.encrypted_message && (
                              <div className="mb-4 p-4 border-2 border-[#8B5CF6] bg-white">
                                <p className="text-xs font-bold tracking-widest uppercase text-[#8B5CF6] mb-2">🔒 Private message</p>
                                <p className="text-sm font-semibold text-neutral-700">
                                  {decryptedNotes[sp.id] || 'Message will be visible once decrypted'}
                                </p>
                              </div>
                            )}
                            <button onClick={async () => {
                              const { data } = await supabase.from('pending_transfers').select('*').eq('id', sp.id).maybeSingle();
                              if (!data) { setStatus({ type: 'error', message: 'Transfer not found in database' }); playSound('error'); return; }
                              handleWithdraw(data as any);
                            }} disabled={loading || !agentStatus}
                              className="w-full py-4 bg-[#8B5CF6] text-white text-sm font-bold tracking-widest uppercase border-2 border-black shadow-[4px_4px_0px_#000] hover:bg-[#7C3AED] hover:-translate-y-0.5 disabled:opacity-50 transition-all">Withdraw Stealth</button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Messages Tab */}
              {activeTab === 'messages' && (
                <div className="space-y-4">
                  {savedMessages.length === 0 ? (
                    <div className="bg-white p-10 text-center border-2 border-black shadow-[2px_2px_0px_#000] md:shadow-[2px_2px_0px_#000] md:shadow-[4px_4px_0px_#000]">
                      <p className="text-sm font-bold tracking-widest uppercase text-neutral-500">No messages</p>
                      <p className="text-xs font-semibold text-neutral-400 mt-2">Encrypted messages appear here after withdrawal</p>
                    </div>
                  ) : savedMessages.map((msg) => {
                    const timeLeft = msg.expiresAt ? Math.max(0, msg.expiresAt - now) : null;
                    const progress = msg.expiresAt && msg.totalDuration ? Math.max(0, (timeLeft! / msg.totalDuration) * 100) : 100;
                    return (
                      <div key={msg.id} className="bg-[#f0ece1] p-5 border-2 border-black shadow-[4px_4px_0px_#000] hover:-translate-y-1 hover:shadow-[6px_6px_0px_#000] transition-all">
                        <div className="flex justify-between items-start mb-4">
                          <div className="flex items-center gap-3">
                            <span className="text-sm font-bold tracking-widest uppercase text-black bg-white border-2 border-black px-3 py-1 shadow-[2px_2px_0px_#000]">@{msg.from}</span>
                            <span className="text-xs font-bold text-neutral-500">{msg.amount} SOL</span>
                          </div>
                          {timeLeft !== null && (
                            <span className="text-xs font-mono font-bold text-neutral-400">{formatTime(timeLeft)}</span>
                          )}
                        </div>
                        <p className="text-sm font-semibold text-black leading-relaxed mb-4">{msg.text}</p>
                        {msg.expiresAt && (
                          <div className="h-2 bg-neutral-300 border border-black">
                            <div className="h-full bg-black border-r border-black transition-all duration-1000" style={{ width: `${progress}%` }} />
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {/* History Tab */}
              {activeTab === 'history' && (
                <div className="space-y-4">
                  {sendHistory.length === 0 ? (
                    <div className="bg-white p-10 text-center border-2 border-black shadow-[2px_2px_0px_#000] md:shadow-[2px_2px_0px_#000] md:shadow-[4px_4px_0px_#000]">
                      <p className="text-sm font-bold tracking-widest uppercase text-neutral-500">No history</p>
                      <p className="text-xs font-semibold text-neutral-400 mt-2">Your sent transactions appear here</p>
                    </div>
                  ) : sendHistory.map((h) => (
                    <div key={h.id} className="bg-[#f0ece1] p-5 border-2 border-black shadow-[4px_4px_0px_#000] hover:bg-white transition-colors">
                      <div className="flex justify-between items-center mb-3">
                        <div className="flex items-center gap-3">
                          <span className="text-sm font-bold tracking-widest text-black">→ @{h.to}</span>
                          {h.stealth && <span className="text-[10px] font-bold tracking-widest uppercase px-2 py-1 bg-black text-white border-2 border-black shadow-[2px_2px_0px_#000]">stealth</span>}
                        </div>
                        <span className="text-sm font-bold text-black">{h.amount} SOL</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-xs font-semibold text-neutral-500">{new Date(h.timestamp).toLocaleString()}</span>
                        {h.signature && <a href={`https://solscan.io/tx/${h.signature}?cluster=devnet`} target="_blank" rel="noopener noreferrer" className="text-xs font-bold font-mono text-neutral-500 hover:text-black hover:underline">{h.signature.slice(0, 6)}... ↗</a>}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Faucet Tab */}
              {activeTab === 'faucet' && <FaucetTab walletAddress={walletAddress} />}
            </div>

            {/* Right sidebar */}
            <div className="hidden lg:block flex-1 space-y-6 sticky top-6">
              <HowItWorks />
              <div className="bg-white p-4 md:p-6 border-2 border-black shadow-[2px_2px_0px_#000] md:shadow-[2px_2px_0px_#000] md:shadow-[4px_4px_0px_#000]">
                <p className="text-xs font-bold tracking-[0.2em] uppercase text-black mb-4">Tech Stack</p>
                <div className="space-y-3">
                  {['ZK-SNARK · Groth16', 'Stealth · ECDH', 'E2E Encrypted Messages', 'Multi-Hop Relay'].map((f) => (
                    <div key={f} className="flex items-center gap-3">
                      <div className="w-2 h-2 bg-black flex-shrink-0 shadow-[2px_2px_0px_#888]" />
                      <span className="text-xs font-bold tracking-wider text-neutral-600">{f}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}
      </main>

      <footer className="relative z-10 border-t-2 border-black mt-16 bg-[#0a0a0a]">
        <div className="max-w-7xl mx-auto px-4 md:px-6 py-8">
          <div className="flex flex-col md:flex-row items-center justify-between gap-6">
            <div className="flex items-center gap-4">
              <img src="/logox.png" alt="Shadow" className="w-12 h-12 object-contain filter invert" />
              <span className="text-white text-lg font-bold tracking-widest uppercase">Shadow</span>
              <span className="text-neutral-500 font-semibold text-sm">© 2025</span>
            </div>
            <div className="flex items-center gap-8">
              <a href="/docs" className="text-sm font-bold tracking-widest uppercase text-neutral-400 hover:text-white transition-colors">Docs</a>
              <a href="https://github.com/0x667TI/ShadowProtocol" target="_blank" className="text-sm font-bold tracking-widest uppercase text-neutral-400 hover:text-white transition-colors">GitHub</a>
              <a href="https://x.com/shadowp40792" target="_blank" className="text-sm font-bold tracking-widest uppercase text-neutral-400 hover:text-white transition-colors">Twitter</a>
            </div>
          </div>
        </div>
      </footer>

      {status && (
        <div className={`fixed bottom-6 left-6 right-6 lg:left-1/2 lg:-translate-x-1/2 lg:right-auto lg:w-full max-w-md mx-auto p-4 z-40 border-2 border-black shadow-[8px_8px_0px_#000] ${status.type === 'error' ? 'bg-[#ffcfcf]' : status.type === 'success' ? 'bg-[#d8f0d8]' : 'bg-[#e4dcfc]'}`}>
          <p className="text-sm tracking-widest uppercase text-center font-bold text-black">{status.message}</p>
        </div>
      )}
      {showCropper && selectedFile && <ImageCropperModal imageFile={selectedFile} onCropComplete={handleCropComplete} onCancel={() => { setShowCropper(false); setSelectedFile(null); }} />}
    </div>
  );
}
