'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { DynamicWidget, useDynamicContext, useUserWallets, useIsLoggedIn } from '@dynamic-labs/sdk-react-core';
import { isSolanaWallet } from '@dynamic-labs/solana';
import { createClient } from '@supabase/supabase-js';
import { Connection, PublicKey, Transaction, TransactionInstruction, SystemProgram, LAMPORTS_PER_SOL } from '@solana/web3.js';
import nacl from 'tweetnacl';
import { encodeBase64, decodeBase64 } from 'tweetnacl-util';
import Image from 'next/image';
import AnimatedBackground from '@/components/AnimatedBackground';

const PROGRAM_ID = new PublicKey('2PcmHz9KZ3RMwru56PthFJx7vyxe7cqJUgaE7QBFKvc4');
const DISCRIMINATORS = { deposit: [242, 35, 198, 137, 82, 225, 242, 182] };

const POOLS: Record<number, { poolPDA: PublicKey; vaultPDA: PublicKey; value: number }> = {
  0: { poolPDA: new PublicKey('83SKixTFPBaENxEGhWSiSmxRHmTkXDWEJbfUt8iaSL8t'), vaultPDA: new PublicKey('7Z7Tzi5mecDXsXyFVZMiCjYkbLBnZJyb1pVo5q7EchNX'), value: 0.1 },
  1: { poolPDA: new PublicKey('34LMAtaxeTuiXAri9fH7jf1XUHjKhH51oZDoFfACgDw9'), vaultPDA: new PublicKey('35vdWyyLuthLWgLLZTksFyBZ7kGdVzW8zgXXtk54Rvms'), value: 1 },
  2: { poolPDA: new PublicKey('cGhg9GRPoH3rfdiFiWQesPPGftbHQCLStQNM7yWrkRY'), vaultPDA: new PublicKey('2iWRhhSTmdxacoAAfzrfrUuntKT2CucNneX36FowYWvR'), value: 10 }
};

const generateSecret = () => Array.from(crypto.getRandomValues(new Uint8Array(32))).map(b => b.toString(16).padStart(2, '0')).join('');
const generateNullifier = () => Array.from(crypto.getRandomValues(new Uint8Array(32))).map(b => b.toString(16).padStart(2, '0')).join('');
const createNote = (poolId: number, amount: number, secret: string, nullifier: string) => `shadow-${poolId}-${amount}-${secret}-${nullifier}`;
const hexToBytes = (hex: string): number[] => { const b: number[] = []; for (let i = 0; i < hex.length; i += 2) b.push(parseInt(hex.substr(i, 2), 16)); return b; };

const generateKeyPair = () => {
  const kp = nacl.box.keyPair();
  return { publicKey: encodeBase64(kp.publicKey), secretKey: encodeBase64(kp.secretKey) };
};

const encryptMessage = (message: string, recipientPublicKey: string, senderSecretKey: string): string => {
  const nonce = nacl.randomBytes(nacl.box.nonceLength);
  const msgBytes = new TextEncoder().encode(message);
  const encrypted = nacl.box(msgBytes, nonce, decodeBase64(recipientPublicKey), decodeBase64(senderSecretKey));
  const full = new Uint8Array(nonce.length + encrypted.length);
  full.set(nonce); full.set(encrypted, nonce.length);
  return encodeBase64(full);
};

const AGENT_URL = process.env.NEXT_PUBLIC_AGENT_URL || 'https://shadow-protocol.xyz/api/agent';
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
const RPC_URL = 'https://api.devnet.solana.com';

export default function DeadManPage() {
  const router = useRouter();

  const playDeathSound = () => {
    try { const audio = new Audio('/death.mp3'); audio.volume = 1.0; audio.play(); } catch (e) { }
  };

  const isLoggedIn = useIsLoggedIn();
  const { primaryWallet } = useDynamicContext();
  const userWallets = useUserWallets();
  const solanaWallet = userWallets.find(w => w.chain === 'SOL' || w.chain === 'SOLANA') || primaryWallet;
  const walletAddress = (solanaWallet as any)?.address || null;

  const [currentUser, setCurrentUser] = useState<any>(null);
  const [vaults, setVaults] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<{ type: 'success' | 'error' | 'info', message: string } | null>(null);
  const [now, setNow] = useState(Date.now());
  const [beneficiary, setBeneficiary] = useState('');
  const [amount, setAmount] = useState(0.1);
  const [intervalDays, setIntervalDays] = useState(0.007);
  const [message, setMessage] = useState('');
  const [beneficiaryResolved, setBeneficiaryResolved] = useState<any>(null);
  const [beneficiaryError, setBeneficiaryError] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [deathNotif, setDeathNotif] = useState<{ vault: any, tx: string } | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);

  const connection = new Connection(RPC_URL, 'confirmed');

  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);

  useEffect(() => {
    if (walletAddress) {
      loadVaults();
      supabase.from('users').select('*').eq('wallet_address', walletAddress).single().then(({ data }) => {
        if (data) setCurrentUser(data);
      });
    }
  }, [walletAddress]);

  useEffect(() => {
    if (!walletAddress) return;
    const poll = setInterval(async () => {
      const { data: activeVaults } = await supabase.from('dead_vaults').select('*').eq('owner_wallet', walletAddress).eq('triggered', false);
      if (activeVaults) {
        for (const vault of activeVaults) {
          const lastCheckin = new Date(vault.last_checkin).getTime();
          const deadlineMs = lastCheckin + vault.interval_days * 24 * 60 * 60 * 1000;
          if (Date.now() > deadlineMs) {
            try {
              const res = await fetch('/api/deadman/trigger', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ vault_id: vault.id }) });
              const result = await res.json();
              if (result.success) { setDeathNotif({ vault, tx: result.signature || 'ZK_PRIVATE' }); playDeathSound(); localStorage.setItem('death_seen_' + vault.id, '1'); loadVaults(); }
            } catch (e) { }
          }
        }
      }
      const { data } = await supabase.from('dead_vaults').select('*').eq('owner_wallet', walletAddress).eq('triggered', true).not('trigger_tx', 'is', null).order('created_at', { ascending: false }).limit(1);
      if (data && data.length > 0) {
        const triggered = data[0];
        const alreadySeen = localStorage.getItem('death_seen_' + triggered.id);
        if (!alreadySeen) { setDeathNotif({ vault: triggered, tx: triggered.trigger_tx }); localStorage.setItem('death_seen_' + triggered.id, '1'); playDeathSound(); loadVaults(); }
      }
    }, 2000);
    return () => clearInterval(poll);
  }, [walletAddress]);

  const loadVaults = async () => {
    const { data } = await supabase.from('dead_vaults').select('*').eq('owner_wallet', walletAddress).eq('triggered', false).order('created_at', { ascending: false });
    if (data) setVaults(data);
  };

  const getTimeLeft = (vault: any) => {
    const lastCheckin = new Date(vault.last_checkin).getTime();
    const deadline = lastCheckin + vault.interval_days * 24 * 60 * 60 * 1000;
    return Math.max(0, deadline - now);
  };

  const formatTimeLeft = (ms: number) => {
    const days = Math.floor(ms / (24 * 60 * 60 * 1000));
    const hours = Math.floor((ms % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000));
    const mins = Math.floor((ms % (60 * 60 * 1000)) / 60000);
    const secs = Math.floor((ms % 60000) / 1000);
    if (days > 0) return `${days}d ${hours}h`;
    if (hours > 0) return `${hours}h ${mins}m`;
    if (mins > 0) return `${mins}m ${secs}s`;
    return `${secs}s`;
  };

  const resolveBeneficiary = async (pseudo: string) => {
    if (!pseudo) return;
    setBeneficiaryError(''); setBeneficiaryResolved(null);
    const { data } = await supabase.from('users').select('*').eq('pseudo', pseudo).single();
    if (data) setBeneficiaryResolved(data);
    else setBeneficiaryError("@" + pseudo + " doesn't exist on Shadow Protocol");
  };

  const createVault = async () => {
    if (!walletAddress || !beneficiary || !amount || !solanaWallet || !beneficiaryResolved) return;
    setLoading(true); setBeneficiaryError(''); setStatus({ type: 'info', message: 'Resolving @' + beneficiary + '...' });
    try {
      const recipientUser = beneficiaryResolved;
      const resolvedAddress = recipientUser.wallet_address;
      const poolId = amount === 0.1 ? 0 : amount === 1 ? 1 : amount === 10 ? 2 : 0;
      const pool = POOLS[poolId];
      if (!pool) { setStatus({ type: 'error', message: 'Invalid amount. Use 0.1, 1, or 10 SOL.' }); setLoading(false); return; }
      setStatus({ type: 'info', message: 'Generating cryptographic secrets...' });
      const secret = generateSecret(); const nullifier = generateNullifier(); const zkNote = createNote(poolId, pool.value, secret, nullifier);
      setStatus({ type: 'info', message: 'Computing Poseidon commitment...' });
      const { buildPoseidon } = await import('circomlibjs');
      const poseidon = await buildPoseidon(); const F = poseidon.F;
      const secretBigInt = BigInt('0x' + secret.slice(0, 32)); const nullifierBigInt = BigInt('0x' + nullifier.slice(0, 32));
      const commitment = F.toObject(poseidon([secretBigInt, nullifierBigInt]));
      setStatus({ type: 'info', message: 'Registering commitment in Merkle tree...' });
      const depositRes = await fetch(`${AGENT_URL}/deposit`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ commitment: commitment.toString(), poolId }) });
      if (!depositRes.ok) { const err = await depositRes.json(); throw new Error('Merkle registration failed: ' + (err.error || 'Unknown error')); }
      const depositData = await depositRes.json(); console.log('Merkle tree registration:', depositData);
      setStatus({ type: 'info', message: 'Confirm deposit in wallet...' });
      const commitmentBytes = new Uint8Array(hexToBytes(secret.slice(0, 64)));
      const txData = Buffer.concat([Buffer.from(DISCRIMINATORS.deposit), Buffer.from(commitmentBytes)]);
      const instruction = new TransactionInstruction({
        keys: [
          { pubkey: pool.poolPDA, isSigner: false, isWritable: true },
          { pubkey: pool.vaultPDA, isSigner: false, isWritable: true },
          { pubkey: new PublicKey(walletAddress), isSigner: true, isWritable: true },
          { pubkey: SystemProgram.programId, isSigner: false, isWritable: false }
        ],
        programId: PROGRAM_ID, data: txData
      });
      const transaction = new Transaction().add(instruction);
      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
      transaction.recentBlockhash = blockhash; transaction.feePayer = new PublicKey(walletAddress);
      let signature: string;
      try {
        if (isSolanaWallet(solanaWallet) && typeof (solanaWallet as any).signAndSendTransaction === 'function') { const result = await (solanaWallet as any).signAndSendTransaction(transaction); signature = typeof result === 'string' ? result : result?.signature ?? result?.hash; }
        else if (isSolanaWallet(solanaWallet)) { const signer = await solanaWallet.getSigner(); const signedTx = await (signer as any).signTransaction(transaction as any); signature = await connection.sendRawTransaction(signedTx.serialize ? signedTx.serialize() : Buffer.from(signedTx.serializedTransaction ?? signedTx, 'base64')); }
        else { const signer = await (solanaWallet as any).connector?.getSigner?.(); if (!signer) throw new Error('Wallet signer not available'); const signedTx = await (signer as any).signTransaction(transaction as any); signature = await connection.sendRawTransaction(signedTx.serialize()); }
      } catch (signerErr: any) {
        if ((window as any).solana?.signAndSendTransaction) { const result = await (window as any).solana.signAndSendTransaction(transaction); signature = result.signature; }
        else { throw signerErr; }
      }
      setStatus({ type: 'info', message: 'Confirming on-chain deposit...' });
      await connection.confirmTransaction({ signature, blockhash, lastValidBlockHeight });
      let encryptedMessage: string | null = null; let senderPublicKey: string | null = null;
      if (message.trim() && recipientUser.public_key) {
        setStatus({ type: 'info', message: 'Encrypting message...' });
        let senderSk = localStorage.getItem(`shadow_sk_${walletAddress}`);
        if (!senderSk) { const kp = generateKeyPair(); senderSk = kp.secretKey; localStorage.setItem(`shadow_sk_${walletAddress}`, senderSk); await supabase.from('users').update({ public_key: kp.publicKey }).eq('wallet_address', walletAddress); senderPublicKey = kp.publicKey; }
        else { const kp = nacl.box.keyPair.fromSecretKey(decodeBase64(senderSk)); senderPublicKey = encodeBase64(kp.publicKey); }
        encryptedMessage = encryptMessage(message.trim(), recipientUser.public_key, senderSk);
      }
      setStatus({ type: 'info', message: 'Saving vault...' });
      const { error: insertError } = await supabase.from('dead_vaults').insert([{
        owner_wallet: walletAddress, owner_pseudo: currentUser?.pseudo || null,
        beneficiary_address: resolvedAddress, beneficiary_pseudo: beneficiary,
        amount: pool.value, pool_id: poolId, zk_note: zkNote, interval_days: intervalDays,
        encrypted_message: encryptedMessage, sender_public_key: senderPublicKey,
        last_checkin: new Date().toISOString(), deposit_tx: signature,
      }]);
      if (insertError) throw new Error('DB Error: ' + insertError.message);
      const intervalLabel = intervalDays === 0.007 ? '10 min (test)' : intervalDays === 30 ? '1 month' : intervalDays === 180 ? '6 months' : '1 year';
      setStatus({ type: 'success', message: `Vault created! ${pool.value} SOL locked. Check-in every ${intervalLabel}.` });
      setShowCreate(false); setBeneficiary(''); setMessage(''); setAmount(0.1); setBeneficiaryResolved(null); loadVaults();
    } catch (e: any) { console.error('Vault creation error:', e); setStatus({ type: 'error', message: e.message }); }
    setLoading(false);
  };

  const checkIn = async (vault: any) => {
    setLoading(true); setStatus({ type: 'info', message: 'Checking in...' });
    try { await supabase.from('dead_vaults').update({ last_checkin: new Date().toISOString() }).eq('id', vault.id); setStatus({ type: 'success', message: 'Check-in confirmed. Timer reset.' }); loadVaults(); }
    catch (e: any) { setStatus({ type: 'error', message: e.message }); }
    setLoading(false);
  };

  const triggerWarning = (vault: any) => {
    const timeLeft = getTimeLeft(vault);
    const total = vault.interval_days * 24 * 60 * 60 * 1000;
    const pct = (total - timeLeft) / total;
    if (pct > 0.9) return 'text-[#ff3333]'; // Bright sharp red
    if (pct > 0.7) return 'text-[#f59e0b]'; // Amber
    return 'text-[#111]'; // Default dark for light theme
  };

  return (
    <div className="text-[#1a1a1a] relative flex flex-col min-h-screen bg-[#dddcd5]">
      <AnimatedBackground />

      {/* Header Content - Exact match to Homepage dock layout */}
      <header className="relative z-50 flex items-center px-6 lg:px-10 py-3 w-full border-b border-[#0a0a0a] bg-[#0a0a0a] gap-10">
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
          <a href="/deadman" className="text-xs font-hud tracking-[0.2em] font-semibold text-white hover:text-[#b026ff] transition-colors">DEAD +</a>
          <a href="/docs" className="text-xs font-hud tracking-[0.2em] text-[#a1a39b] hover:text-[#b026ff] transition-colors">DOC +</a>
        </nav>

        {/* Connection Widget & User aligned right */}
        <div className="hidden md:flex items-center gap-4 ml-auto">
          {currentUser && (
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
          <nav className="flex flex-col gap-6">
            <a href="/" className="text-xs font-hud tracking-[0.2em] text-[#a1a39b]">PLATFORM +</a>
            <a href="/main" className="text-xs font-hud tracking-[0.2em] text-[#a1a39b]">APP +</a>
            <a href="/deadman" className="text-xs font-hud tracking-[0.2em] font-semibold text-white">DEAD +</a>
            <a href="/docs" className="text-xs font-hud tracking-[0.2em] text-[#a1a39b]">DOC +</a>

            <div className="mt-4 pt-4 border-t border-[#333]">
              {currentUser && (
                <div className="flex items-center gap-2 px-3 py-2 mb-4 bg-[#1a1a1a] border border-[#333]">
                  {currentUser.avatar_url && (
                    <div className="w-6 h-6 grayscale">
                      <img src={currentUser.avatar_url} alt="Avatar" className="w-full h-full object-cover" />
                    </div>
                  )}
                  <span className="text-xs font-mono text-[#a1a39b]">@{currentUser.pseudo}</span>
                </div>
              )}
              <DynamicWidget />
            </div>
          </nav>
        </div>
      )}


      {/* Death Notification Popup - Refactored to Light HUD Danger motif */}
      {deathNotif && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#dddcd5]/90 backdrop-blur-sm" onClick={() => setDeathNotif(null)}>
          <div className="relative max-w-md w-full mx-4 border-2 border-[#ff3333] bg-white p-8 text-center shadow-[20px_20px_0px_rgba(255,51,51,0.1)] clip-angled-tl"
            onClick={e => e.stopPropagation()}>
            <div className="absolute top-0 left-0 w-full h-2 bg-[repeating-linear-gradient(45deg,#ff3333,#ff3333_10px,#fff_10px,#fff_20px)]" />

            <div className="text-[64px] mb-4 mt-2">💀</div>
            <h2 className="text-2xl font-hud uppercase tracking-widest text-[#ff3333] mb-2">Vault Triggered</h2>
            <p className="text-sm font-medium text-[#666] mb-6">You failed to check in. Funds released via ZK proof.</p>

            <div className="border border-[#c3c5bc] bg-[#f0f1ed] p-4 mb-6">
              <p className="text-[10px] font-bold text-[#888] uppercase tracking-widest mb-1">Amount Released</p>
              <p className="text-3xl font-hud font-bold text-[#111]">{deathNotif.vault.amount} SOL</p>
              <p className="text-[10px] font-bold text-[#888] uppercase tracking-widest mt-4 mb-1">Beneficiary</p>
              <p className="text-sm font-medium text-[#111]">@{deathNotif.vault.beneficiary_pseudo}</p>
              <p className="text-[10px] text-[#888] font-mono mt-3 border-t border-[#c3c5bc] pt-2">Funds sent via ZK proof — fully private</p>
            </div>

            <button onClick={() => setDeathNotif(null)} className="px-8 py-3 w-full bg-[#ff3333] text-white text-[12px] font-bold tracking-[0.2em] uppercase hover:bg-[#cc0000] transition-colors">
              Acknowledge
            </button>
          </div>
        </div>
      )}


      {/* Main App Content */}
      <main className="relative z-10 max-w-4xl mx-auto px-6 py-12 lg:py-20 w-full">

        {/* Title Block */}
        <div className="mb-16">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 border border-[#c3c5bc] bg-white/60 mb-6 clip-angled-tl shadow-sm">
            <div className="w-1.5 h-1.5 bg-[#b026ff] animate-pulse" />
            <span className="text-[10px] font-mono tracking-[0.25em] font-bold text-[#666] uppercase">Devnet Active</span>
          </div>
          <h1 className="text-5xl lg:text-6xl font-hud font-bold uppercase mb-4 text-[#111]">
            DEAD MAN'S SWITCH
          </h1>
          <p className="text-sm font-semibold tracking-[0.15em] text-[#666] max-w-xl">
            LOCK SOL IN A VAULT. IF YOU DON'T CHECK IN, FUNDS ARE RELEASED TO YOUR BENEFICIARY WITH FULL ZK PRIVACY + ENCRYPTED MESSAGE.
          </p>
        </div>

        {/* Status Toast */}
        {status && (
          <div className={`mb-10 px-6 py-4 border font-medium text-sm shadow-sm flex items-center gap-3 ${status.type === 'success' ? 'border-[#22C55E] text-[#166534] bg-[#dcfce7]'
            : status.type === 'error' ? 'border-[#ff3333] text-[#991b1b] bg-[#fee2e2]'
              : 'border-[#111] text-[#111] bg-white'
            }`}>
            <div className={`w-2 h-2 ${status.type === 'success' ? 'bg-[#22C55E]' : status.type === 'error' ? 'bg-[#ff3333]' : 'bg-[#111] animate-pulse'}`} />
            {status.message}
          </div>
        )}

        {!isLoggedIn ? (
          <div className="text-center py-20 bg-white border border-[#c3c5bc] shadow-[10px_10px_30px_rgba(0,0,0,0.05)] clip-angled-br relative">
            <div className="absolute top-4 left-4 text-[#c3c5bc] font-bold tracking-[0.2em] text-[10px]">AUTH REQUIRED</div>
            <p className="text-sm font-bold tracking-[0.2em] uppercase text-[#111]">Connect wallet to access your vaults</p>
          </div>
        ) : (
          <>
            {/* Create Vault Interface */}
            <div className="mb-12">
              {!showCreate ? (
                <button onClick={() => setShowCreate(true)}
                  className="w-full py-6 bg-[#f0f1ed] border-2 border-dashed border-[#c3c5bc] text-sm font-bold tracking-[0.2em] uppercase text-[#666] hover:border-[#111] hover:text-[#111] hover:bg-white transition-all">
                  + INITIALIZE NEW VAULT +
                </button>
              ) : (
                <div className="bg-white border border-[#c3c5bc] p-8 lg:p-10 shadow-[10px_10px_30px_rgba(0,0,0,0.05)] clip-angled-br relative">
                  <div className="absolute top-6 left-6 text-[#a1a39b] font-bold tracking-widest text-[14px]">++</div>
                  <h3 className="text-2xl font-hud uppercase tracking-[0.1em] text-[#111] mb-8 ml-8">New Vault Protocol</h3>

                  <div className="space-y-8 pl-8">
                    {/* Beneficiary Field */}
                    <div>
                      <label className="text-[11px] font-bold text-[#888] uppercase tracking-[0.15em] mb-2 block">Beneficiary Identity</label>
                      <div className="flex items-center border border-[#c3c5bc] bg-[#f8f9f7] focus-within:border-[#111] focus-within:bg-white transition-colors">
                        <div className="px-4 py-3 border-r border-[#c3c5bc] bg-[#e2e4dd] text-[#666] font-mono">@</div>
                        <input
                          value={beneficiary}
                          onChange={e => { setBeneficiary(e.target.value.replace('@', '')); setBeneficiaryResolved(null); setBeneficiaryError(''); }}
                          onBlur={e => resolveBeneficiary(e.target.value.replace('@', '').trim())}
                          placeholder="username"
                          className="flex-1 bg-transparent py-3 px-4 text-sm font-medium text-[#111] placeholder-[#a1a39b] outline-none"
                        />
                      </div>
                      <div className="h-6 mt-1 flex items-center">
                        {beneficiaryResolved && <p className="text-[11px] font-bold text-[#166534] uppercase tracking-wider">✓ @{beneficiary} verified {beneficiaryResolved.public_key ? '[E2E Ready]' : '[No PK]'}</p>}
                        {beneficiaryError && <p className="text-[11px] font-bold text-[#ff3333] uppercase tracking-wider">✗ {beneficiaryError}</p>}
                      </div>
                    </div>

                    {/* Amount Field */}
                    <div>
                      <label className="text-[11px] font-bold text-[#888] uppercase tracking-[0.15em] mb-2 block">Allocation (SOL)</label>
                      <div className="flex gap-4">
                        {[0.1, 1, 10].map(a => (
                          <button key={a} onClick={() => setAmount(a)}
                            className={`flex-1 py-4 text-lg font-hud transition-all border ${amount === a
                              ? 'border-[#111] bg-[#111] text-white shadow-[4px_4px_0px_#e2e4dd]'
                              : 'border-[#c3c5bc] bg-white text-[#666] hover:bg-[#f0f1ed]'
                              }`}>
                            {a}
                          </button>
                        ))}
                      </div>
                      <p className="text-[10px] text-[#888] uppercase tracking-wider mt-2 font-mono">Restricted to anonymous pool denominations</p>
                    </div>

                    {/* Interval Field */}
                    <div>
                      <label className="text-[11px] font-bold text-[#888] uppercase tracking-[0.15em] mb-2 block">Check-in Interval</label>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                        {[{ label: '10 min (test)', val: 0.007 }, { label: '1 month', val: 30 }, { label: '6 months', val: 180 }, { label: '1 year', val: 365 }].map(o => (
                          <button key={o.val} onClick={() => setIntervalDays(o.val)}
                            className={`py-3 text-[12px] font-bold tracking-wider uppercase transition-all border ${intervalDays === o.val
                              ? 'border-[#111] bg-[#111] text-white'
                              : 'border-[#c3c5bc] bg-white text-[#666] hover:bg-[#f0f1ed]'
                              }`}>
                            {o.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Encrypted Message */}
                    <div>
                      <label className="text-[11px] font-bold text-[#0284c7] uppercase tracking-[0.15em] mb-2 block flex items-center gap-2">
                        <span className="w-1.5 h-1.5 bg-[#0284c7] inline-block" />
                        Encrypted Payload (Optional)
                      </label>
                      <textarea
                        value={message}
                        onChange={e => setMessage(e.target.value)}
                        placeholder="Write a private message. Only the beneficiary can decrypt this."
                        maxLength={500} rows={3}
                        className="w-full bg-[#f0f5f9] border border-[#0284c7] p-4 text-sm text-[#0369a1] font-medium placeholder-[#7dd3fc] outline-none focus:border-[#0369a1] focus:bg-white resize-none transition-colors"
                      />
                    </div>

                    {/* Actions */}
                    <div className="flex gap-4 pt-4 border-t border-[#e2e4dd]">
                      <button onClick={() => { setShowCreate(false); setBeneficiaryResolved(null); }}
                        className="flex-1 py-4 bg-white border border-[#c3c5bc] text-[#111] text-[12px] font-bold tracking-[0.2em] uppercase hover:bg-[#f0f1ed] transition-colors">
                        Abort
                      </button>
                      <button onClick={createVault} disabled={loading || !beneficiary || !beneficiaryResolved}
                        className="flex-1 py-4 bg-[#b026ff] text-white text-[12px] font-bold tracking-[0.2em] uppercase disabled:opacity-50 disabled:bg-[#c3c5bc] hover:bg-[#8e19d6] transition-colors shadow-[4px_4px_0px_#111]">
                        {loading ? 'PROCESSING...' : `DEPLOY VAULT`}
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Vaults List */}
            <h2 className="text-xl font-hud uppercase tracking-[0.1em] text-[#111] mb-6">Active Vaults</h2>

            {vaults.length === 0 ? (
              <div className="text-center py-16 bg-[#f0f1ed] border border-[#c3c5bc] border-dashed">
                <p className="text-[13px] font-mono tracking-widest text-[#888] uppercase">Zero vaults active</p>
              </div>
            ) : (
              <div className="space-y-6">
                {vaults.map((vault, idx) => {
                  const timeLeft = getTimeLeft(vault);
                  const total = vault.interval_days * 24 * 60 * 60 * 1000;
                  const progress = Math.min(100, ((total - timeLeft) / total) * 100);
                  const colorClass = triggerWarning(vault);

                  return (
                    <div key={vault.id} className="bg-white border border-[#c3c5bc] p-6 lg:p-8 flex flex-col md:flex-row gap-8 items-center shadow-sm relative group overflow-hidden">
                      {/* Active indicator bar */}
                      <div className="absolute left-0 top-0 h-full w-1 bg-[#111]" />

                      <div className="flex-1 w-full">
                        <div className="flex items-start justify-between mb-6">
                          <div>
                            <span className="text-3xl font-hud font-bold text-[#111]">{vault.amount} SOL</span>
                            <p className="text-[11px] font-bold uppercase tracking-widest text-[#888] mt-1">
                              Target: <span className="text-[#111]">@{vault.beneficiary_pseudo}</span>
                            </p>
                            {vault.encrypted_message && (
                              <p className="inline-block mt-2 px-2 py-0.5 bg-[#e0f2fe] border border-[#bae6fd] text-[#0284c7] text-[10px] font-bold uppercase tracking-wider">
                                + Encrypted Note
                              </p>
                            )}
                          </div>

                          <div className="text-right">
                            <p className={`text-2xl font-hud tabular-nums ${colorClass}`}>{formatTimeLeft(timeLeft)}</p>
                            <p className="text-[10px] font-bold text-[#888] uppercase tracking-widest mt-1">Time Remaining</p>
                            <p className="text-[10px] text-[#666] font-mono mt-1">Cycle: {vault.interval_days === 0.007 ? '10m' : vault.interval_days === 30 ? '1mo' : vault.interval_days === 180 ? '6mo' : '1y'}</p>
                          </div>
                        </div>

                        {/* Custom Progress Bar */}
                        <div className="h-2 w-full bg-[#e2e4dd] border border-[#c3c5bc] mb-6 relative">
                          <div
                            className={`absolute top-0 left-0 h-full transition-all duration-1000 ${progress > 90 ? 'bg-[#ff3333]' : progress > 70 ? 'bg-[#f59e0b]' : 'bg-[#111]'}`}
                            style={{ width: `${progress}%` }}
                          />
                        </div>

                        <button onClick={() => checkIn(vault)} disabled={loading}
                          className="w-full py-3 bg-white border-2 border-[#111] text-[#111] text-[12px] font-bold tracking-[0.2em] uppercase hover:bg-[#111] hover:text-white disabled:opacity-40 transition-colors">
                          Check In [RESET TIMER]
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}

        {/* How it works grid */}
        <div className="mt-20 grid lg:grid-cols-3 gap-6 pt-10 border-t border-[#c3c5bc]">
          {[
            { n: '01', title: 'ALLOCATE', desc: 'Deposit SOL into a ZK pool. Optionally attach an encrypted key or note.' },
            { n: '02', title: 'MONITOR', desc: 'Ping the smart contract before cycles end to reset the dead man\'s countdown.' },
            { n: '03', title: 'EXECUTION', desc: 'If a cycle expires, the agent executes the anonymous transfer to your beneficiary automatically.' },
          ].map(s => (
            <div key={s.n} className="bg-[#f8f9f7] border border-[#e2e4dd] p-6 group">
              <div className="flex items-center gap-3 mb-4">
                <span className="text-lg font-hud text-[#b026ff]">{s.n}</span>
                <h3 className="text-[13px] font-bold tracking-[0.15em] text-[#111] uppercase">{s.title}</h3>
              </div>
              <p className="text-[13px] text-[#666] font-medium leading-relaxed">{s.desc}</p>
            </div>
          ))}
        </div>

      </main>

      {/* Footer */}
      <footer className="relative z-10 border-t border-[#c3c5bc] mt-auto">
        <div className="max-w-7xl mx-auto px-10 py-8">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-3 opacity-90">
              <div className="w-10 h-10 overflow-hidden">
                <Image src="/logox.png" alt="Shadow" width={40} height={40} className="object-contain" />
              </div>
              <span className="font-hud uppercase text-[#111] tracking-widest text-sm">Shadow Protocol © 25</span>
            </div>
            <div className="flex items-center gap-6">
              <a href="/docs" className="text-[11px] font-bold uppercase tracking-widest text-[#888] hover:text-[#111] transition-colors">Documentation</a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
