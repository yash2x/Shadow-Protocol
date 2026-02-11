'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import { Transaction, TransactionInstruction, SystemProgram } from '@solana/web3.js';
import { PROGRAM_ID, DENOMINATIONS } from '@/config';
import { supabase, User, PendingTransfer } from '@/lib/supabase';

const DISCRIMINATORS = { deposit: [242, 35, 198, 137, 82, 225, 242, 182] };
const AGENT_URL = process.env.NEXT_PUBLIC_AGENT_URL || 'https://shadowprotocol.duckdns.org/api/agent';

const generateSecret = (): string => { const a = new Uint8Array(32); crypto.getRandomValues(a); return Array.from(a).map(b => b.toString(16).padStart(2, '0')).join(''); };
const generateNullifier = (): string => { const a = new Uint8Array(32); crypto.getRandomValues(a); return Array.from(a).map(b => b.toString(16).padStart(2, '0')).join(''); };
const createNote = (poolId: number, amount: number, secret: string, nullifier: string): string => `shadow-${poolId}-${amount}-${secret}-${nullifier}`;
const parseNote = (note: string) => { const p = note.split('-'); if (p.length !== 5 || p[0] !== 'shadow') return null; return { poolId: parseInt(p[1]), amount: parseFloat(p[2]), secret: p[3], nullifier: p[4] }; };
const hexToBytes = (hex: string): number[] => { const b = []; for (let i = 0; i < hex.length; i += 2) b.push(parseInt(hex.substr(i, 2), 16)); return b; };

const playSound = (type: 'send' | 'receive' | 'success' | 'error') => {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const osc = ctx.createOscillator(); const gain = ctx.createGain();
    osc.connect(gain); gain.connect(ctx.destination);
    switch(type) {
      case 'send': osc.frequency.setValueAtTime(520, ctx.currentTime); osc.frequency.setValueAtTime(680, ctx.currentTime + 0.1); break;
      case 'receive': osc.frequency.setValueAtTime(880, ctx.currentTime); osc.frequency.setValueAtTime(1100, ctx.currentTime + 0.1); osc.frequency.setValueAtTime(880, ctx.currentTime + 0.2); break;
      case 'success': osc.frequency.setValueAtTime(523, ctx.currentTime); osc.frequency.setValueAtTime(659, ctx.currentTime + 0.1); osc.frequency.setValueAtTime(784, ctx.currentTime + 0.2); osc.frequency.setValueAtTime(1047, ctx.currentTime + 0.3); break;
      case 'error': osc.frequency.setValueAtTime(200, ctx.currentTime); break;
    }
    osc.type = 'sine'; gain.gain.setValueAtTime(0.15, ctx.currentTime); gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.4);
    osc.start(ctx.currentTime); osc.stop(ctx.currentTime + 0.4);
  } catch {}
};

interface TransactionProof { signature: string; amount: number; recipient?: string; timestamp: number; type: 'sent' | 'received'; }
interface WithdrawalState { id: string; amount: number; status: 'pending' | 'processing' | 'completed' | 'failed'; executeAt: number; createdAt: number; delay: number; from?: string; signature?: string; notified?: boolean; }
const WITHDRAWALS_KEY = 'shadow_withdrawals_v7';

const AnimatedBackground = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = canvasRef.current; if (!canvas) return;
    const ctx = canvas.getContext('2d'); if (!ctx) return;
    let animationId: number;
    let particles: Array<{ x: number; y: number; z: number; vx: number; vy: number; vz: number; size: number; opacity: number; color: string }> = [];
    let transferLines: Array<{ x1: number; y1: number; x2: number; y2: number; progress: number }> = [];

    const resize = () => { canvas.width = window.innerWidth; canvas.height = window.innerHeight; };
    resize(); window.addEventListener('resize', resize);

    for (let i = 0; i < 50; i++) {
      particles.push({ x: Math.random() * canvas.width, y: Math.random() * canvas.height, z: Math.random() * 1000, vx: (Math.random() - 0.5) * 0.8, vy: (Math.random() - 0.5) * 0.8 - 0.3, vz: (Math.random() - 0.5) * 2, size: Math.random() * 3 + 1.5, opacity: Math.random() * 0.4 + 0.1, color: Math.random() > 0.5 ? '#8B5CF6' : '#6366F1' });
    }

    const createLine = () => {
      if (transferLines.length < 4) {
        const side = Math.floor(Math.random() * 4);
        let x1, y1, x2, y2;
        if (side === 0) { x1 = 0; y1 = Math.random() * canvas.height; x2 = canvas.width; y2 = Math.random() * canvas.height; }
        else if (side === 1) { x1 = canvas.width; y1 = Math.random() * canvas.height; x2 = 0; y2 = Math.random() * canvas.height; }
        else if (side === 2) { x1 = Math.random() * canvas.width; y1 = 0; x2 = Math.random() * canvas.width; y2 = canvas.height; }
        else { x1 = Math.random() * canvas.width; y1 = canvas.height; x2 = Math.random() * canvas.width; y2 = 0; }
        transferLines.push({ x1, y1, x2, y2, progress: 0 });
      }
    };
    setInterval(createLine, 2500);

    const animate = () => {
      ctx.fillStyle = 'rgba(0, 0, 0, 0.08)'; ctx.fillRect(0, 0, canvas.width, canvas.height);
      particles.forEach(p => {
        p.x += p.vx; p.y += p.vy; p.z += p.vz;
        if (p.x < 0) p.x = canvas.width; if (p.x > canvas.width) p.x = 0;
        if (p.y < 0) p.y = canvas.height; if (p.y > canvas.height) p.y = 0;
        if (p.z < 0) p.z = 1000; if (p.z > 1000) p.z = 0;
        const scale = 1000 / (1000 + p.z);
        const screenX = canvas.width / 2 + (p.x - canvas.width / 2) * scale;
        const screenY = canvas.height / 2 + (p.y - canvas.height / 2) * scale;
        const screenSize = p.size * scale;
        const gradient = ctx.createRadialGradient(screenX, screenY, 0, screenX, screenY, screenSize * 2.5);
        gradient.addColorStop(0, p.color + Math.floor(p.opacity * 255).toString(16).padStart(2, '0'));
        gradient.addColorStop(0.5, p.color + '30'); gradient.addColorStop(1, 'transparent');
        ctx.fillStyle = gradient; ctx.beginPath(); ctx.arc(screenX, screenY, screenSize * 2.5, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = p.color; ctx.globalAlpha = p.opacity; ctx.beginPath(); ctx.arc(screenX, screenY, screenSize, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 1;
      });
      transferLines.forEach((line, index) => {
        line.progress += 0.006;
        if (line.progress >= 1) { transferLines.splice(index, 1); return; }
        const currentX = line.x1 + (line.x2 - line.x1) * line.progress;
        const currentY = line.y1 + (line.y2 - line.y1) * line.progress;
        const trailStart = Math.max(0, line.progress - 0.12);
        const startX = line.x1 + (line.x2 - line.x1) * trailStart;
        const startY = line.y1 + (line.y2 - line.y1) * trailStart;
        const gradient = ctx.createLinearGradient(startX, startY, currentX, currentY);
        gradient.addColorStop(0, 'transparent'); gradient.addColorStop(0.5, '#8B5CF660'); gradient.addColorStop(1, '#8B5CF6');
        ctx.strokeStyle = gradient; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(startX, startY); ctx.lineTo(currentX, currentY); ctx.stroke();
        const headGradient = ctx.createRadialGradient(currentX, currentY, 0, currentX, currentY, 10);
        headGradient.addColorStop(0, '#FFFFFF'); headGradient.addColorStop(0.3, '#8B5CF6'); headGradient.addColorStop(1, 'transparent');
        ctx.fillStyle = headGradient; ctx.beginPath(); ctx.arc(currentX, currentY, 10, 0, Math.PI * 2); ctx.fill();
      });
      particles.forEach((p1, i) => {
        particles.slice(i + 1).forEach(p2 => {
          const dx = p1.x - p2.x; const dy = p1.y - p2.y; const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < 120) { ctx.strokeStyle = `rgba(139, 92, 246, ${0.08 * (1 - dist / 120)})`; ctx.lineWidth = 0.5; ctx.beginPath(); ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y); ctx.stroke(); }
        });
      });
      animationId = requestAnimationFrame(animate);
    };
    animate();
    return () => { cancelAnimationFrame(animationId); window.removeEventListener('resize', resize); };
  }, []);
  return <canvas ref={canvasRef} className="fixed inset-0 pointer-events-none" style={{ zIndex: 0 }} />;
};

export default function Home() {
  const router = useRouter();
  const { connection } = useConnection();
  const { publicKey, sendTransaction, connected } = useWallet();

  const [activeTab, setActiveTab] = useState<'send' | 'receive'>('send');
  const [selectedPool, setSelectedPool] = useState(DENOMINATIONS[0]);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<{ type: 'success' | 'error' | 'info'; message: string } | null>(null);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [showRegister, setShowRegister] = useState(false);
  const [pseudoInput, setPseudoInput] = useState('');
  const [recipientPseudo, setRecipientPseudo] = useState('');
  const [pendingTransfers, setPendingTransfers] = useState<PendingTransfer[]>([]);
  const [agentStatus, setAgentStatus] = useState<any>(null);
  const [pendingWithdrawals, setPendingWithdrawals] = useState<WithdrawalState[]>([]);
  const [previousTransferCount, setPreviousTransferCount] = useState(0);
  const [withdrawAddress, setWithdrawAddress] = useState('');
  const [showWithdrawModal, setShowWithdrawModal] = useState<PendingTransfer | null>(null);
  const [successPopup, setSuccessPopup] = useState<{ amount: number; visible: boolean } | null>(null);
  const [transactionProof, setTransactionProof] = useState<TransactionProof | null>(null);
  const [now, setNow] = useState(Date.now());
  const [mounted, setMounted] = useState(false);

  useEffect(() => { setMounted(true); }, []);
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer); }, []);
  useEffect(() => { localStorage.removeItem('shadow_withdrawals_v5'); localStorage.removeItem('shadow_withdrawals_v6'); }, []);
  useEffect(() => { if (publicKey) loadUser(); else { setCurrentUser(null); setShowRegister(false); } checkAgent(); }, [publicKey]);
  useEffect(() => { if (currentUser) { loadPendingTransfers(); const interval = setInterval(() => { loadPendingTransfers(); checkAgent(); updatePendingWithdrawals(); }, 1500); return () => clearInterval(interval); } }, [currentUser]);
  useEffect(() => { if (pendingTransfers.length > previousTransferCount && previousTransferCount > 0) { playSound('receive'); setStatus({ type: 'info', message: 'New payment received!' }); } setPreviousTransferCount(pendingTransfers.length); }, [pendingTransfers.length]);
  useEffect(() => { const stored = localStorage.getItem(WITHDRAWALS_KEY); if (stored) { try { const parsed = JSON.parse(stored); const recent = parsed.filter((w: WithdrawalState) => Date.now() - (w.createdAt || 0) < 24 * 60 * 60 * 1000); setPendingWithdrawals(recent); } catch { setPendingWithdrawals([]); } } }, []);
  useEffect(() => { if (status) { const timer = setTimeout(() => setStatus(null), 4000); return () => clearTimeout(timer); } }, [status]);

  const saveWithdrawals = (ws: WithdrawalState[]) => { setPendingWithdrawals(ws); localStorage.setItem(WITHDRAWALS_KEY, JSON.stringify(ws)); };
  const checkAgent = async () => { try { const r = await fetch(`${AGENT_URL}/status`); setAgentStatus(await r.json()); } catch { setAgentStatus(null); } };
  const loadUser = async () => { if (!publicKey) return; const { data } = await supabase.from('users').select('*').eq('wallet_address', publicKey.toString()).single(); if (data) { setCurrentUser(data); setShowRegister(false); } else setShowRegister(true); };
  const loadPendingTransfers = async () => { if (!currentUser) return; const { data } = await supabase.from('pending_transfers').select('*').eq('recipient_pseudo', currentUser.pseudo).eq('claimed', false).order('created_at', { ascending: false }); if (data) setPendingTransfers(data); };

  const updatePendingWithdrawals = async () => {
    if (pendingWithdrawals.length === 0) return;
    const updated: WithdrawalState[] = [];
    
    for (const w of pendingWithdrawals) {
      // Garder les completed pendant 2 min max
      if (w.status === 'completed' || w.status === 'failed') { 
        if (Date.now() - (w.createdAt || 0) < 2 * 60 * 1000) updated.push(w); 
        continue; 
      }
      
      // Si le timer est expiré localement, passer en processing
      const currentTime = Date.now();
      if (w.status === 'pending' && currentTime >= w.executeAt) {
        updated.push({ ...w, status: 'processing' });
        continue;
      }
      
      try {
        const res = await fetch(`${AGENT_URL}/withdraw/${w.id}`);
        if (!res.ok) { updated.push(w); continue; }
        
        const data = await res.json();
        
        // CRITIQUE : Vérifier si on doit notifier (une seule fois)
        if (data.status === 'completed' && !w.notified) {
          playSound('success');
          setSuccessPopup({ amount: w.amount, visible: true });
          setTimeout(() => setSuccessPopup(null), 4000);
          updated.push({ ...w, status: 'completed', signature: data.finalSignature, notified: true });
        } else {
          // Sinon juste mettre à jour le status sans notification
          updated.push({ ...w, status: data.status, signature: data.finalSignature });
        }
      } catch { 
        updated.push(w); 
      }
    }
    
    saveWithdrawals(updated);
  };

  const registerUser = async () => {
    if (!publicKey || !pseudoInput.trim()) return;
    const pseudo = pseudoInput.trim().toLowerCase();
    if (pseudo.length < 3) { setStatus({ type: 'error', message: 'Min 3 characters' }); playSound('error'); return; }
    setLoading(true);
    const { data: existing } = await supabase.from('users').select('id').eq('pseudo', pseudo).single();
    if (existing) { setStatus({ type: 'error', message: 'Username taken' }); playSound('error'); setLoading(false); return; }
    const { data } = await supabase.from('users').insert([{ pseudo, wallet_address: publicKey.toString() }]).select().single();
    if (data) { setCurrentUser(data); setShowRegister(false); setStatus({ type: 'success', message: 'Welcome to Shadow Protocol' }); playSound('success'); }
    setLoading(false);
  };

  const handleSend = async () => {
    if (!publicKey || !connected || !currentUser) return;
    const recipient = recipientPseudo.trim().toLowerCase().replace('@', '');
    if (!recipient) { setStatus({ type: 'error', message: 'Enter a recipient' }); playSound('error'); return; }
    if (recipient === currentUser.pseudo) { setStatus({ type: 'error', message: 'Cannot send to yourself' }); playSound('error'); return; }
    const { data: recipientUser } = await supabase.from('users').select('*').eq('pseudo', recipient).single();
    if (!recipientUser) { setStatus({ type: 'error', message: 'User not found' }); playSound('error'); return; }
    setLoading(true); setStatus({ type: 'info', message: 'Initializing transfer...' }); setTransactionProof(null);
    try {
      const secret = generateSecret(); const nullifier = generateNullifier();
      const note = createNote(selectedPool.id, selectedPool.value, secret, nullifier);
      try {
        const { buildPoseidon } = await import('circomlibjs');
        const poseidon = await buildPoseidon(); const F = poseidon.F;
        const secretBigInt = BigInt('0x' + secret.slice(0, 32)); const nullifierBigInt = BigInt('0x' + nullifier.slice(0, 32));
        const commitment = F.toObject(poseidon([secretBigInt, nullifierBigInt]));
        await fetch(`${AGENT_URL}/deposit`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ commitment: commitment.toString(), poolId: selectedPool.id }) });
      } catch {}
      setStatus({ type: 'info', message: 'Confirm in wallet...' });
      const commitment = new Uint8Array(hexToBytes(secret.slice(0, 64)));
      const data = Buffer.concat([Buffer.from(DISCRIMINATORS.deposit), Buffer.from(commitment)]);
      const instruction = new TransactionInstruction({ keys: [{ pubkey: selectedPool.poolPDA, isSigner: false, isWritable: true }, { pubkey: selectedPool.vaultPDA, isSigner: false, isWritable: true }, { pubkey: publicKey, isSigner: true, isWritable: true }, { pubkey: SystemProgram.programId, isSigner: false, isWritable: false }], programId: PROGRAM_ID, data: data });
      const transaction = new Transaction().add(instruction);
      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
      transaction.recentBlockhash = blockhash; transaction.feePayer = publicKey;
      const signature = await sendTransaction(transaction, connection);
      setStatus({ type: 'info', message: 'Confirming...' });
      await connection.confirmTransaction({ signature, blockhash, lastValidBlockHeight });
      await supabase.from('pending_transfers').insert([{ recipient_pseudo: recipient, encrypted_note: note, amount: selectedPool.value, sender_pseudo: currentUser.pseudo }]);
      playSound('send');
      setTransactionProof({ signature, amount: selectedPool.value, recipient, timestamp: Date.now(), type: 'sent' });
      setStatus({ type: 'success', message: `Sent ${selectedPool.value} SOL to @${recipient}` });
      setRecipientPseudo('');
    } catch (error: any) { playSound('error'); setStatus({ type: 'error', message: error.message || 'Transaction failed' }); }
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
      const newW: WithdrawalState = { id: result.id, amount: result.amount || parsed.amount, status: 'pending', executeAt: result.executeAt, createdAt: Date.now(), delay: result.delay, from: transfer.sender_pseudo || undefined, notified: false };
      saveWithdrawals([...pendingWithdrawals, newW]);
      loadPendingTransfers();
      playSound('send');
      setStatus({ type: 'success', message: `Withdrawal scheduled (${result.delayFormatted})` });
      setWithdrawAddress('');
    } catch (error: any) { playSound('error'); setStatus({ type: 'error', message: error.message || 'Withdrawal failed' }); }
    finally { setLoading(false); }
  };

  const formatTime = (ms: number) => { if (ms <= 0) return '0:00'; const totalSeconds = Math.ceil(ms / 1000); const mins = Math.floor(totalSeconds / 60); const secs = totalSeconds % 60; return `${mins}:${secs.toString().padStart(2, '0')}`; };

  if (!mounted) return null;

  if (connected && showRegister) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center p-4 relative overflow-hidden font-mono">
        <AnimatedBackground />
        <div className="w-full max-w-md relative z-10 animate-fadeIn">
          <div className="bg-[#0a0a0f]/90 backdrop-blur-xl p-8 border border-[#8B5CF6]/30">
            <div className="flex items-center justify-center gap-3 mb-8">
              <div className="w-3 h-3 bg-[#8B5CF6] animate-pulse" />
              <span className="text-[14px] font-bold tracking-[0.25em] uppercase text-white">Shadow</span>
            </div>
            <h1 className="text-[12px] font-bold tracking-[0.2em] uppercase text-center text-white mb-2">Create Identity</h1>
            <p className="text-[10px] tracking-[0.15em] uppercase text-white/40 text-center mb-8">Choose a username</p>
            <div className="mb-6">
              <div className="flex items-center border-2 border-white/[0.1] bg-black/50 hover:border-[#8B5CF6]/40 transition-colors">
                <span className="text-[18px] text-[#8B5CF6] pl-4 pr-2 font-bold">@</span>
                <input type="text" value={pseudoInput} onChange={(e) => setPseudoInput(e.target.value.replace(/[^a-zA-Z0-9_]/g, '').toLowerCase())} placeholder="username" className="flex-1 bg-transparent py-4 pr-4 text-[14px] text-white placeholder-white/20 outline-none font-mono" maxLength={20} />
              </div>
            </div>
            <button onClick={registerUser} disabled={loading || pseudoInput.length < 3} className="w-full py-4 bg-[#8B5CF6] text-white text-[11px] font-bold tracking-[0.25em] uppercase disabled:opacity-30 hover:bg-[#7C3AED] transition-all">
              {loading ? 'Creating...' : 'Continue'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black text-white relative overflow-hidden font-mono">
      <AnimatedBackground />

      {successPopup?.visible && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm animate-fadeIn" onClick={() => setSuccessPopup(null)}>
          <div className="bg-[#0a0a0f]/95 p-8 text-center border-2 border-[#22C55E]/50 mx-4 shadow-[0_0_60px_rgba(34,197,94,0.3)] animate-scaleIn">
            <div className="w-16 h-16 mx-auto mb-5 border-2 border-[#22C55E] flex items-center justify-center">
              <svg className="w-8 h-8 text-[#22C55E]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>
            </div>
            <h2 className="text-[14px] font-bold tracking-[0.25em] uppercase text-[#22C55E] mb-2">Withdraw Successful</h2>
            <p className="text-[13px] text-white/70">{successPopup.amount} SOL received!</p>
          </div>
        </div>
      )}

      {showWithdrawModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-fadeIn">
          <div className="bg-[#0a0a0f]/95 p-6 w-full max-w-md border-2 border-[#22C55E]/30 animate-scaleIn">
            <h2 className="text-[12px] font-bold tracking-[0.2em] uppercase text-[#22C55E] mb-2">Withdraw {showWithdrawModal.amount} SOL</h2>
            <p className="text-[10px] tracking-[0.15em] uppercase text-white/30 mb-5">From @{showWithdrawModal.sender_pseudo}</p>
            <div className="mb-5">
              <span className="text-[10px] tracking-[0.2em] uppercase text-white/40 mb-3 block">Destination</span>
              <input type="text" value={withdrawAddress} onChange={(e) => setWithdrawAddress(e.target.value)} placeholder="Leave empty for connected wallet" className="w-full p-4 bg-black/50 border-2 border-[#22C55E]/20 text-[12px] text-white placeholder-white/20 outline-none focus:border-[#22C55E]/50 transition-colors font-mono" />
            </div>
            <div className="flex gap-3">
              <button onClick={() => setShowWithdrawModal(null)} className="flex-1 py-3 bg-white/[0.05] border border-white/[0.1] text-[10px] font-bold tracking-[0.2em] uppercase text-white/50 hover:bg-white/[0.08] transition-all">Cancel</button>
              <button onClick={() => handleWithdraw(showWithdrawModal, withdrawAddress || undefined)} disabled={loading} className="flex-1 py-3 bg-[#22C55E] text-black text-[10px] font-bold tracking-[0.2em] uppercase hover:bg-[#16A34A] disabled:opacity-40 transition-all">{loading ? 'Processing...' : 'Withdraw'}</button>
            </div>
          </div>
        </div>
      )}

      <header className="relative border-b border-white/[0.08] bg-black/50 backdrop-blur-xl z-20">
        <div className="w-full px-4 md:px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2 cursor-pointer group" onClick={() => router.push('/app')}>
            <div className="w-2 h-2 bg-[#8B5CF6] group-hover:shadow-[0_0_15px_rgba(139,92,246,1)] transition-all" />
            <span className="text-[13px] font-bold tracking-[0.2em] uppercase text-white group-hover:text-[#8B5CF6] transition-colors">Shadow</span>
          </div>
          <div className="flex items-center gap-3">
            {currentUser && (
              <div className="flex items-center gap-2 px-3 py-1.5 border border-[#8B5CF6]/40 bg-[#8B5CF6]/10">
                <span className="text-[11px] tracking-[0.15em] uppercase text-[#8B5CF6] font-bold">@{currentUser.pseudo}</span>
              </div>
            )}
            <WalletMultiButton />
          </div>
        </div>
      </header>

      <div className="relative border-b border-white/[0.06] bg-[#0a0a0f]/80 backdrop-blur-sm z-10">
        <div className="max-w-[600px] mx-auto px-4 py-3 flex items-center justify-center gap-8">
          <div className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${agentStatus ? 'bg-[#22C55E] shadow-[0_0_12px_rgba(34,197,94,1)] animate-pulse' : 'bg-red-500'}`} />
            <span className={`text-[10px] tracking-[0.2em] uppercase font-bold ${agentStatus ? 'text-[#22C55E]' : 'text-red-400'}`}>{agentStatus ? 'Online' : 'Offline'}</span>
          </div>
          <div className="flex items-center gap-2">
            <svg className="w-4 h-4 text-[#8B5CF6]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeWidth={1.5} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>
            <span className="text-[10px] tracking-[0.2em] uppercase text-white/50 font-bold">ZK</span>
          </div>
          <div className="flex items-center gap-2">
            <svg className="w-4 h-4 text-[#8B5CF6]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeWidth={1.5} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
            <span className="text-[10px] tracking-[0.2em] uppercase text-white/50 font-bold">{agentStatus?.relayerCount || 0} Relayers</span>
          </div>
        </div>
      </div>

      <main className="relative max-w-[600px] mx-auto px-4 py-6 z-10">
        <div className="flex mb-6 border-2 border-white/[0.1] bg-black/30 backdrop-blur-sm">
          <button onClick={() => setActiveTab('send')} className={`flex-1 py-3.5 text-[11px] tracking-[0.25em] uppercase font-bold transition-all ${activeTab === 'send' ? 'bg-white text-black' : 'text-white/50 hover:text-white/70'}`}>Send</button>
          <button onClick={() => setActiveTab('receive')} className={`flex-1 py-3.5 text-[11px] tracking-[0.25em] uppercase font-bold transition-all relative ${activeTab === 'receive' ? 'bg-[#22C55E] text-black' : 'text-white/50 hover:text-white/70'}`}>
            Receive
            {pendingTransfers.length > 0 && <span className="absolute top-2 right-4 w-2.5 h-2.5 bg-red-500 shadow-[0_0_10px_rgba(239,68,68,1)] animate-pulse rounded-full" />}
          </button>
        </div>

        {activeTab === 'send' && (
          <div className="space-y-5 animate-fadeIn">
            <div className="bg-[#0a0a0f]/80 backdrop-blur-xl p-6 border-2 border-white/[0.1] hover:border-white/[0.2] transition-colors">
              <h2 className="text-[12px] font-bold tracking-[0.2em] uppercase text-white mb-2">Private Transfer</h2>
              <p className="text-[9px] tracking-[0.15em] uppercase text-white/40 mb-6">Send SOL without leaving a trace</p>

              <div className="mb-5">
                <span className="text-[10px] tracking-[0.2em] uppercase text-white/40 mb-3 block">Amount (SOL)</span>
                <div className="grid grid-cols-3 gap-3">
                  {DENOMINATIONS.map((pool) => (
                    <button key={pool.id} onClick={() => setSelectedPool(pool)} className={`py-4 text-center transition-all border-2 ${selectedPool.id === pool.id ? 'bg-white/10 border-white/60' : 'bg-black/30 border-white/[0.08] hover:border-white/[0.2]'}`}>
                      <span className={`text-[18px] font-bold ${selectedPool.id === pool.id ? 'text-white' : 'text-white/50'}`}>{pool.value}</span>
                      <span className="block text-[9px] tracking-[0.2em] uppercase text-white/30 mt-1">SOL</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="mb-6">
                <span className="text-[10px] tracking-[0.2em] uppercase text-white/40 mb-3 block">Recipient</span>
                <div className="flex items-center border-2 border-white/[0.1] bg-black/50 hover:border-white/[0.25] focus-within:border-white/[0.4] transition-colors">
                  <span className="text-[18px] text-white/50 pl-4 pr-2 font-bold">@</span>
                  <input type="text" value={recipientPseudo} onChange={(e) => setRecipientPseudo(e.target.value.replace(/[^a-zA-Z0-9_]/g, '').toLowerCase())} placeholder="username" className="flex-1 bg-transparent py-4 pr-4 text-[14px] text-white placeholder-white/20 outline-none font-mono" />
                </div>
              </div>

              <button onClick={handleSend} disabled={loading || !connected || !recipientPseudo} className="w-full py-4 bg-white text-black text-[11px] font-bold tracking-[0.25em] uppercase disabled:opacity-30 hover:bg-white/90 transition-all">
                {loading ? <span className="animate-pulse">Processing...</span> : `Send ${selectedPool.value} SOL`}
              </button>

              <div className="mt-6 pt-5 border-t border-white/[0.06]">
                <div className="flex items-center justify-between mb-3"><span className="text-[10px] tracking-[0.15em] uppercase text-white/30">Protocol Fee</span><span className="text-[11px] text-white/50">0.3%</span></div>
                <div className="flex items-center justify-between mb-3"><span className="text-[10px] tracking-[0.15em] uppercase text-white/30">Privacy Level</span><span className="text-[11px] text-white font-bold">Maximum</span></div>
                <div className="flex items-center justify-between"><span className="text-[10px] tracking-[0.15em] uppercase text-white/30">Proof System</span><span className="text-[11px] text-white/50">Groth16 ZK-SNARK</span></div>
              </div>
            </div>

            {transactionProof && transactionProof.type === 'sent' && (
              <div className="bg-[#0a0a0f]/80 backdrop-blur-xl p-5 border-2 border-white/20 animate-scaleIn">
                <div className="flex items-center gap-4 mb-4">
                  <div className="w-10 h-10 border-2 border-white/40 flex items-center justify-center">
                    <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                  </div>
                  <div>
                    <p className="text-[12px] font-bold tracking-[0.15em] uppercase text-white">Sent {transactionProof.amount} SOL</p>
                    {transactionProof.recipient && <p className="text-[10px] text-white/40">to @{transactionProof.recipient}</p>}
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[10px] tracking-[0.15em] uppercase text-white/30">Signature</span>
                  <a href={`https://solscan.io/tx/${transactionProof.signature}?cluster=devnet`} target="_blank" rel="noopener noreferrer" className="text-[11px] text-white/60 hover:text-white transition-colors font-mono">
                    {transactionProof.signature.slice(0, 8)}...{transactionProof.signature.slice(-6)}
                  </a>
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === 'receive' && (
          <div className="space-y-5 animate-fadeIn">
            {pendingTransfers.length > 0 && (
              <div className="bg-[#0a0a0f]/80 backdrop-blur-xl p-6 border-2 border-[#22C55E]/30">
                <span className="text-[12px] font-bold tracking-[0.2em] uppercase text-[#22C55E] mb-5 block">Incoming Payments</span>
                <div className="space-y-3">
                  {pendingTransfers.map((t) => (
                    <div key={t.id} className="bg-black/40 p-5 border-2 border-[#22C55E]/15 hover:border-[#22C55E]/40 transition-all">
                      <div className="flex justify-between items-center mb-4">
                        <div>
                          <span className="text-[20px] font-bold text-[#22C55E]">{t.amount}</span>
                          <span className="text-[12px] text-white/40 ml-2">SOL</span>
                        </div>
                        <span className="text-[10px] tracking-[0.15em] uppercase text-white/30">from @{t.sender_pseudo}</span>
                      </div>
                      <button onClick={() => { setShowWithdrawModal(t); setWithdrawAddress(''); }} disabled={loading || !agentStatus} className="w-full py-3.5 bg-[#22C55E] text-black text-[10px] font-bold tracking-[0.25em] uppercase hover:bg-[#16A34A] disabled:opacity-40 transition-all">Withdraw</button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {pendingWithdrawals.filter(w => w.status === 'pending' || w.status === 'processing').length > 0 && (
              <div className="bg-[#0a0a0f]/80 backdrop-blur-xl p-6 border-2 border-[#22C55E]/20">
                <span className="text-[12px] font-bold tracking-[0.2em] uppercase text-[#22C55E] mb-5 block">Processing</span>
                <div className="space-y-4">
                  {pendingWithdrawals.filter(w => w.status === 'pending' || w.status === 'processing').map(w => {
                    const timeLeft = Math.max(0, w.executeAt - now);
                    const totalDuration = w.delay || 60000;
                    const elapsed = totalDuration - timeLeft;
                    const progress = Math.min(100, (elapsed / totalDuration) * 100);
                    return (
                      <div key={w.id} className="border-2 border-[#22C55E]/20 p-5">
                        <div className="flex justify-between items-center mb-4">
                          <div>
                            <span className="text-[18px] font-bold text-[#22C55E]">{w.amount}</span>
                            <span className="text-[12px] text-white/40 ml-2">SOL</span>
                            {w.from && <span className="text-[10px] text-white/30 ml-3">@{w.from}</span>}
                          </div>
                          <div className="text-right">
                            <span className="text-[18px] font-bold text-[#22C55E] font-mono">{timeLeft > 0 ? formatTime(timeLeft) : 'Sending...'}</span>
                            <p className="text-[9px] tracking-[0.2em] uppercase text-white/30">{w.status}</p>
                          </div>
                        </div>
                        <div className="h-1 bg-white/[0.08] rounded-full overflow-hidden">
                          <div className="h-full bg-[#22C55E] transition-all duration-1000" style={{ width: `${progress}%` }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {pendingWithdrawals.filter(w => w.status === 'completed').length > 0 && (
              <div className="bg-[#0a0a0f]/60 backdrop-blur-sm p-5 border border-[#22C55E]/15">
                <span className="text-[10px] tracking-[0.25em] uppercase text-[#22C55E]/60 mb-4 block font-bold">Completed</span>
                <div className="space-y-3">
                  {pendingWithdrawals.filter(w => w.status === 'completed').slice(-3).reverse().map(w => (
                    <div key={w.id} className="flex justify-between items-center py-3 border-b border-white/[0.05] last:border-0">
                      <div className="flex items-center gap-3">
                        <span className="text-[12px] text-[#22C55E] font-bold">{w.amount} SOL</span>
                        <span className="text-[9px] tracking-[0.2em] uppercase text-[#22C55E] px-2 py-1 bg-[#22C55E]/10 border border-[#22C55E]/30 font-bold">Success</span>
                      </div>
                      <div className="flex items-center gap-3">
                        {w.signature && (
                          <a href={`https://solscan.io/tx/${w.signature}?cluster=devnet`} target="_blank" rel="noopener noreferrer" className="text-[10px] text-[#22C55E]/60 hover:text-[#22C55E] transition-colors font-mono">
                            {w.signature.slice(0, 6)}...
                          </a>
                        )}
                        <div className="w-2 h-2 bg-[#22C55E]" />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {pendingTransfers.length === 0 && pendingWithdrawals.length === 0 && (
              <div className="bg-[#0a0a0f]/80 backdrop-blur-xl p-8 text-center border-2 border-[#22C55E]/15">
                <div className="w-16 h-16 mx-auto mb-4 border-2 border-[#22C55E]/25 flex items-center justify-center">
                  <svg className="w-8 h-8 text-[#22C55E]/40" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeWidth={1.5} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" /></svg>
                </div>
                <p className="text-[11px] tracking-[0.2em] uppercase text-[#22C55E]/50 mb-4">No incoming payments</p>
                {currentUser && (
                  <div>
                    <p className="text-[9px] tracking-[0.2em] uppercase text-white/25 mb-3">Share your username</p>
                    <div className="inline-block px-4 py-2 border-2 border-[#22C55E]/30 bg-[#22C55E]/5">
                      <span className="text-[12px] text-[#22C55E] font-bold">@{currentUser.pseudo}</span>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {status && (
          <div className={`fixed bottom-5 left-5 right-5 max-w-[600px] mx-auto p-4 z-40 backdrop-blur-xl border-2 ${status.type === 'error' ? 'bg-red-500/10 border-red-500/40' : status.type === 'success' ? 'bg-[#22C55E]/10 border-[#22C55E]/40' : 'bg-black/80 border-white/[0.15]'}`}>
            <p className={`text-[11px] tracking-[0.15em] uppercase text-center font-bold ${status.type === 'error' ? 'text-red-400' : status.type === 'success' ? 'text-[#22C55E]' : 'text-white/60'}`}>
              {status.message}
            </p>
          </div>
        )}
      </main>

      <style jsx global>{`
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes scaleIn { from { opacity: 0; transform: scale(0.95); } to { opacity: 1; transform: scale(1); } }
        .animate-fadeIn { animation: fadeIn 0.5s ease-out forwards; }
        .animate-scaleIn { animation: scaleIn 0.3s ease-out forwards; }
      `}</style>
    </div>
  );
}
