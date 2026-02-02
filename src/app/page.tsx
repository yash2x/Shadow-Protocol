'use client';

import { useState, useEffect } from 'react';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import { PublicKey, Transaction, TransactionInstruction, SystemProgram } from '@solana/web3.js';
import { PROGRAM_ID, POOLS, DENOMINATIONS } from '@/config';
import { supabase, User, PendingTransfer, Notification } from '@/lib/supabase';

const DISCRIMINATORS = { deposit: [242, 35, 198, 137, 82, 225, 242, 182] };
const AGENT_URL = process.env.NEXT_PUBLIC_AGENT_URL || 'http://localhost:3002';

async function generateZKProof(secret: string, nullifier: string, poolId: number) {
  const snarkjs = (await import('snarkjs')).default || await import('snarkjs');
  const { buildPoseidon } = await import('circomlibjs');
  const poseidon = await buildPoseidon();
  const F = poseidon.F;
  
  const secretBigInt = BigInt('0x' + secret.slice(0, 32));
  const nullifierBigInt = BigInt('0x' + nullifier.slice(0, 32));
  const commitment = F.toObject(poseidon([secretBigInt, nullifierBigInt]));
  const nullifierHash = F.toObject(poseidon([nullifierBigInt]));
  
  const merkleRes = await fetch(`${AGENT_URL}/merkle-proof/${poolId}/${commitment.toString()}`);
  if (!merkleRes.ok) throw new Error('Commitment not found. Make a new deposit first.');
  const merkleData = await merkleRes.json();
  
  const { proof, publicSignals } = await snarkjs.groth16.fullProve(
    {
      secret: secretBigInt.toString(),
      nullifier: nullifierBigInt.toString(),
      pathElements: merkleData.pathElements,
      pathIndices: merkleData.pathIndices,
      root: merkleData.root,
      nullifierHash: nullifierHash.toString(),
    },
    '/zk/mixer.wasm',
    '/zk/mixer_final.zkey'
  );
  
  return { proof, publicSignals, root: merkleData.root };
}

async function registerDeposit(secret: string, nullifier: string, poolId: number) {
  const { buildPoseidon } = await import('circomlibjs');
  const poseidon = await buildPoseidon();
  const F = poseidon.F;
  
  const secretBigInt = BigInt('0x' + secret.slice(0, 32));
  const nullifierBigInt = BigInt('0x' + nullifier.slice(0, 32));
  const commitment = F.toObject(poseidon([secretBigInt, nullifierBigInt]));
  
  const res = await fetch(`${AGENT_URL}/deposit`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ commitment: commitment.toString(), poolId }),
  });
  return res.json();
}

const generateSecret = (): string => {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return Array.from(array).map(b => b.toString(16).padStart(2, '0')).join('');
};

const generateNullifier = (): string => {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return Array.from(array).map(b => b.toString(16).padStart(2, '0')).join('');
};

const createNote = (poolId: number, amount: number, secret: string, nullifier: string): string => {
  return `shadow-${poolId}-${amount}-${secret}-${nullifier}`;
};

const parseNote = (note: string) => {
  const parts = note.split('-');
  if (parts.length !== 5 || (parts[0] !== 'shadow' && parts[0] !== 'phantom')) return null;
  return { poolId: parseInt(parts[1]), amount: parseFloat(parts[2]), secret: parts[3], nullifier: parts[4] };
};

const hexToBytes = (hex: string): number[] => {
  const bytes = [];
  for (let i = 0; i < hex.length; i += 2) bytes.push(parseInt(hex.substr(i, 2), 16));
  return bytes;
};

export default function Home() {
  const { connection } = useConnection();
  const { publicKey, sendTransaction, connected } = useWallet();
  
  const [activeTab, setActiveTab] = useState<'deposit' | 'send' | 'withdraw' | 'activity'>('deposit');
  const [selectedPool, setSelectedPool] = useState(DENOMINATIONS[1]);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<{ type: 'success' | 'error' | 'info'; message: string } | null>(null);
  
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [showRegister, setShowRegister] = useState(false);
  const [pseudoInput, setPseudoInput] = useState('');
  const [generatedNote, setGeneratedNote] = useState<string | null>(null);
  const [withdrawNote, setWithdrawNote] = useState('');
  const [withdrawAddress, setWithdrawAddress] = useState('');
  const [recipientPseudo, setRecipientPseudo] = useState('');
  const [pendingTransfers, setPendingTransfers] = useState<PendingTransfer[]>([]);
  const [savedNotes, setSavedNotes] = useState<any[]>([]);
  const [vaultBalances, setVaultBalances] = useState<{[key: number]: number}>({});
  const [agentStatus, setAgentStatus] = useState<any>(null);
  const [pendingWithdrawals, setPendingWithdrawals] = useState<any[]>([]);

  useEffect(() => {
    if (publicKey) loadUser();
    else setCurrentUser(null);
    loadVaultBalances();
    checkAgent();
  }, [publicKey]);

  useEffect(() => {
    if (currentUser) loadPendingTransfers();
    const interval = setInterval(() => {
      loadPendingTransfers();
      loadVaultBalances();
      checkAgent();
      updatePendingWithdrawals();
    }, 5000);
    return () => clearInterval(interval);
  }, [currentUser]);

  useEffect(() => {
    const stored = localStorage.getItem('shadow_mixer_notes');
    if (stored) setSavedNotes(JSON.parse(stored));
    const storedW = localStorage.getItem('shadow_pending_withdrawals');
    if (storedW) setPendingWithdrawals(JSON.parse(storedW));
  }, []);

  const checkAgent = async () => {
    try {
      const res = await fetch(`${AGENT_URL}/status`);
      setAgentStatus(await res.json());
    } catch { setAgentStatus(null); }
  };

  const updatePendingWithdrawals = async () => {
    const updated = [];
    for (const w of pendingWithdrawals) {
      if (w.status === 'completed' || w.status === 'failed') { updated.push(w); continue; }
      try {
        const res = await fetch(`${AGENT_URL}/withdraw/${w.id}`);
        const data = await res.json();
        updated.push({ ...w, ...data });
        if (data.status === 'completed') {
          const notes = savedNotes.map(n => n.note === w.note ? { ...n, status: 'withdrawn' } : n);
          setSavedNotes(notes);
          localStorage.setItem('shadow_mixer_notes', JSON.stringify(notes));
        }
      } catch { updated.push(w); }
    }
    setPendingWithdrawals(updated);
    localStorage.setItem('shadow_pending_withdrawals', JSON.stringify(updated));
  };

  const loadVaultBalances = async () => {
    try {
      const balances: {[key: number]: number} = {};
      for (const pool of DENOMINATIONS) {
        balances[pool.id] = (await connection.getBalance(pool.vaultPDA)) / 1e9;
      }
      setVaultBalances(balances);
    } catch {}
  };

  const loadUser = async () => {
    if (!publicKey) return;
    const { data } = await supabase.from('users').select('*').eq('wallet_address', publicKey.toString()).single();
    if (data) { setCurrentUser(data); setShowRegister(false); }
    else setShowRegister(true);
  };

  const registerUser = async () => {
    if (!publicKey || !pseudoInput.trim()) return;
    const pseudo = pseudoInput.trim().toLowerCase();
    if (pseudo.length < 3) { setStatus({ type: 'error', message: 'Min 3 characters' }); return; }
    setLoading(true);
    const { data: existing } = await supabase.from('users').select('id').eq('pseudo', pseudo).single();
    if (existing) { setStatus({ type: 'error', message: 'Username taken' }); setLoading(false); return; }
    const { data } = await supabase.from('users').insert([{ pseudo, wallet_address: publicKey.toString() }]).select().single();
    if (data) { setCurrentUser(data); setShowRegister(false); }
    setLoading(false);
  };

  const loadPendingTransfers = async () => {
    if (!currentUser) return;
    const { data } = await supabase.from('pending_transfers').select('*').eq('recipient_pseudo', currentUser.pseudo).eq('claimed', false);
    if (data) setPendingTransfers(data);
  };

  const handleDeposit = async () => {
    if (!publicKey || !connected) { setStatus({ type: 'error', message: 'Connect your wallet' }); return; }
    setLoading(true);
    setStatus({ type: 'info', message: 'Preparing deposit...' });
    setGeneratedNote(null);

    try {
      const secret = generateSecret();
      const nullifier = generateNullifier();
      const note = createNote(selectedPool.id, selectedPool.value, secret, nullifier);
      
      setStatus({ type: 'info', message: 'Registering in Merkle Tree...' });
      const depositResult = await registerDeposit(secret, nullifier, selectedPool.id);
      
      setStatus({ type: 'info', message: 'Confirm in wallet...' });
      const commitment = new Uint8Array(hexToBytes(secret.slice(0, 64)));
      const data = Buffer.concat([Buffer.from(DISCRIMINATORS.deposit), Buffer.from(commitment)]);
      
      const instruction = new TransactionInstruction({
        keys: [
          { pubkey: selectedPool.poolPDA, isSigner: false, isWritable: true },
          { pubkey: selectedPool.vaultPDA, isSigner: false, isWritable: true },
          { pubkey: publicKey, isSigner: true, isWritable: true },
          { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
        ],
        programId: PROGRAM_ID,
        data: data,
      });

      const transaction = new Transaction().add(instruction);
      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
      transaction.recentBlockhash = blockhash;
      transaction.feePayer = publicKey;
      
      const signature = await sendTransaction(transaction, connection);
      setStatus({ type: 'info', message: 'Confirming on-chain...' });
      await connection.confirmTransaction({ signature, blockhash, lastValidBlockHeight });

      const newNote = { id: Date.now().toString(), note, poolId: selectedPool.id, amount: selectedPool.value, timestamp: Date.now(), status: 'active', tx: signature, merkleIndex: depositResult.index };
      const notes = [...savedNotes, newNote];
      setSavedNotes(notes);
      localStorage.setItem('shadow_mixer_notes', JSON.stringify(notes));
      setGeneratedNote(note);
      loadVaultBalances();
      setStatus({ type: 'success', message: `Deposit confirmed!\nMerkle Index: ${depositResult.index}` });
    } catch (error: any) {
      setStatus({ type: 'error', message: error.message });
    } finally {
      setLoading(false);
    }
  };

  const handleSendByPseudo = async () => {
    if (!publicKey || !connected || !currentUser) return;
    const recipient = recipientPseudo.trim().toLowerCase().replace('@', '');
    if (!recipient) return;

    const { data: recipientUser } = await supabase.from('users').select('*').eq('pseudo', recipient).single();
    if (!recipientUser) { setStatus({ type: 'error', message: 'User not found' }); return; }

    setLoading(true);
    setStatus({ type: 'info', message: 'Creating transfer...' });

    try {
      const secret = generateSecret();
      const nullifier = generateNullifier();
      const note = createNote(selectedPool.id, selectedPool.value, secret, nullifier);
      
      await registerDeposit(secret, nullifier, selectedPool.id);
      
      const commitment = new Uint8Array(hexToBytes(secret.slice(0, 64)));
      const data = Buffer.concat([Buffer.from(DISCRIMINATORS.deposit), Buffer.from(commitment)]);
      
      const instruction = new TransactionInstruction({
        keys: [
          { pubkey: selectedPool.poolPDA, isSigner: false, isWritable: true },
          { pubkey: selectedPool.vaultPDA, isSigner: false, isWritable: true },
          { pubkey: publicKey, isSigner: true, isWritable: true },
          { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
        ],
        programId: PROGRAM_ID,
        data: data,
      });

      const transaction = new Transaction().add(instruction);
      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
      transaction.recentBlockhash = blockhash;
      transaction.feePayer = publicKey;
      
      const signature = await sendTransaction(transaction, connection);
      await connection.confirmTransaction({ signature, blockhash, lastValidBlockHeight });

      await supabase.from('pending_transfers').insert([{ recipient_pseudo: recipient, encrypted_note: note, amount: selectedPool.value, sender_pseudo: currentUser.pseudo }]);
      await supabase.from('notifications').insert([{ recipient_pseudo: recipient, type: 'received', message: `${selectedPool.value} SOL from @${currentUser.pseudo}`, amount: selectedPool.value, sender_pseudo: currentUser.pseudo }]);

      loadVaultBalances();
      setStatus({ type: 'success', message: `Sent to @${recipient}` });
      setRecipientPseudo('');
    } catch (error: any) {
      setStatus({ type: 'error', message: error.message });
    } finally {
      setLoading(false);
    }
  };

  const handleClaimTransfer = async (transfer: PendingTransfer) => {
    if (!currentUser) return;
    setLoading(true);
    try {
      await supabase.from('pending_transfers').update({ claimed: true }).eq('id', transfer.id);
      const parsed = parseNote(transfer.encrypted_note);
      const newNote = { id: Date.now().toString(), note: transfer.encrypted_note, poolId: parsed?.poolId || 1, amount: transfer.amount, timestamp: Date.now(), status: 'active', from: transfer.sender_pseudo };
      const notes = [...savedNotes, newNote];
      setSavedNotes(notes);
      localStorage.setItem('shadow_mixer_notes', JSON.stringify(notes));
      loadPendingTransfers();
      setStatus({ type: 'success', message: 'Claimed!' });
    } catch (error: any) {
      setStatus({ type: 'error', message: error.message });
    } finally {
      setLoading(false);
    }
  };

  const handleWithdraw = async () => {
    if (!withdrawNote || !withdrawAddress) {
      setStatus({ type: 'error', message: 'Fill all fields' });
      return;
    }

    const parsed = parseNote(withdrawNote);
    if (!parsed) { setStatus({ type: 'error', message: 'Invalid note' }); return; }
    if (!agentStatus) { setStatus({ type: 'error', message: 'Agent offline' }); return; }

    setLoading(true);
    setStatus({ type: 'info', message: 'Generating ZK proof...' });

    try {
      const { proof, publicSignals } = await generateZKProof(parsed.secret, parsed.nullifier, parsed.poolId);
      
      setStatus({ type: 'info', message: 'Verifying proof...' });

      const response = await fetch(`${AGENT_URL}/withdraw`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          proof, publicSignals,
          recipientAddress: withdrawAddress,
          poolId: parsed.poolId,
          amount: parsed.amount,
        })
      });
      
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);

      const newW = { id: result.id, note: withdrawNote, amount: result.amount, numHops: result.numHops, status: 'pending', zkVerified: result.zkVerified, delayReason: result.delayReason, delayFormatted: result.delayFormatted, createdAt: Date.now() };
      const ws = [...pendingWithdrawals, newW];
      setPendingWithdrawals(ws);
      localStorage.setItem('shadow_pending_withdrawals', JSON.stringify(ws));

      setStatus({ type: 'success', message: `ZK Proof verified!\n\nDelay: ${result.delayFormatted}\nReason: ${result.delayReason}\nRelayer #${result.relayerId} | ${result.numHops} hops` });
      setWithdrawNote('');
      setWithdrawAddress('');
    } catch (error: any) {
      setStatus({ type: 'error', message: error.message });
    } finally {
      setLoading(false);
    }
  };

  const copyNote = (text: string) => {
    navigator.clipboard.writeText(text);
    setStatus({ type: 'success', message: 'Copied!' });
    setTimeout(() => setStatus(null), 2000);
  };

  const activeW = pendingWithdrawals.filter(w => w.status === 'pending' || w.status === 'processing');

  if (connected && showRegister) {
    return (
      <div className="min-h-screen bg-[#0a0a0f] flex items-center justify-center p-4">
        <div className="absolute inset-0 bg-gradient-to-br from-purple-900/20 via-transparent to-cyan-900/20" />
        <div className="relative w-full max-w-md">
          <div className="relative bg-[#12121a] border border-white/10 rounded-2xl p-8">
            <img src="/images/shadow-logo.png" alt="Shadow" className="h-32 mx-auto mb-6" />
            <h1 className="text-2xl font-bold text-white text-center mb-2">Create Identity</h1>
            <p className="text-gray-500 text-center mb-6">Choose your anonymous username</p>
            <div className="relative mb-6">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500">@</span>
              <input type="text" value={pseudoInput} onChange={(e) => setPseudoInput(e.target.value.replace(/[^a-zA-Z0-9_]/g, ''))} placeholder="username" className="w-full pl-10 pr-4 py-4 bg-black/50 border border-white/10 rounded-xl text-white focus:border-purple-500 focus:outline-none" maxLength={20} />
            </div>
            <button onClick={registerUser} disabled={loading || pseudoInput.length < 3} className={`w-full py-4 rounded-xl font-semibold transition-all ${loading || pseudoInput.length < 3 ? 'bg-gray-800 text-gray-600' : 'bg-gradient-to-r from-purple-600 to-cyan-600 text-white hover:opacity-90 active:scale-[0.98]'}`}>
              {loading ? '...' : 'Continue'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-white">
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-purple-600/10 rounded-full blur-3xl animate-pulse" />
        <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-cyan-600/10 rounded-full blur-3xl animate-pulse" />
      </div>

      {/* HEADER */}
      <header className="relative border-b border-white/5 backdrop-blur-xl">
        <div className="max-w-6xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-6">
              <img src="/images/shadow-logo.png" alt="Shadow" className="h-20 w-auto drop-shadow-[0_0_20px_rgba(139,92,246,0.4)]" />
              <div className="flex flex-col">
                {currentUser && (
                  <span className="text-green-400 font-bold text-2xl">@{currentUser.pseudo}</span>
                )}
                <div className="flex items-center gap-2 text-sm mt-1">
                  {agentStatus ? (
                    <span className="text-green-400 flex items-center gap-1.5">
                      <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
                      Agent Online
                    </span>
                  ) : (
                    <span className="text-red-400 flex items-center gap-1.5">
                      <span className="w-2 h-2 bg-red-400 rounded-full" />
                      Offline
                    </span>
                  )}
                </div>
              </div>
            </div>
            <WalletMultiButton className="!bg-purple-600/20 !border !border-purple-500/30 !rounded-xl !h-12 !px-6 !font-semibold hover:!bg-purple-600/30 transition-all" />
          </div>
        </div>
      </header>

      {/* Navigation */}
      <div className="max-w-6xl mx-auto px-6 mt-8">
        <div className="flex gap-2 p-1.5 bg-white/5 rounded-xl w-fit">
          {['deposit', 'send', 'withdraw', 'activity'].map((tab) => (
            <button key={tab} onClick={() => setActiveTab(tab as any)} className={`px-7 py-3 rounded-lg font-semibold transition-all ${activeTab === tab ? 'bg-gradient-to-r from-purple-600 to-cyan-600 text-white shadow-lg shadow-purple-500/20' : 'text-gray-400 hover:text-white hover:bg-white/5'}`}>
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </button>
          ))}
        </div>
      </div>

      <main className="max-w-6xl mx-auto px-6 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 bg-[#12121a] border border-white/5 rounded-2xl p-6">
            
            {activeTab === 'deposit' && (
              <div className="space-y-6">
                <div>
                  <h2 className="text-2xl font-bold">Deposit</h2>
                  <p className="text-gray-500">Select amount and receive a secret note</p>
                </div>
                <div className="grid grid-cols-3 gap-4">
                  {DENOMINATIONS.map((pool) => (
                    <button key={pool.id} onClick={() => setSelectedPool(pool)} className={`p-6 rounded-xl border transition-all hover:scale-[1.02] active:scale-[0.98] ${selectedPool.id === pool.id ? 'border-purple-500 bg-purple-500/10 shadow-lg shadow-purple-500/10' : 'border-white/10 hover:border-white/20'}`}>
                      <div className="text-2xl font-bold">{pool.label}</div>
                      {agentStatus?.pools?.[pool.id] && (
                        <div className="text-xs text-purple-400 mt-2">{agentStatus.pools[pool.id].deposits} deposits</div>
                      )}
                    </button>
                  ))}
                </div>
                <button onClick={handleDeposit} disabled={loading || !connected} className={`w-full py-4 rounded-xl font-bold text-lg transition-all ${loading || !connected ? 'bg-gray-800 text-gray-600' : 'bg-gradient-to-r from-purple-600 to-cyan-600 hover:opacity-90 active:scale-[0.99] shadow-lg shadow-purple-500/20'}`}>
                  {loading ? 'Processing...' : `Deposit ${selectedPool.label}`}
                </button>
                {generatedNote && (
                  <div className="bg-green-500/10 border border-green-500/20 rounded-xl p-6">
                    <h3 className="text-green-400 font-bold text-lg mb-2">Secret Note Generated</h3>
                    <p className="text-sm text-gray-500 mb-3">Save this! You need it to withdraw.</p>
                    <div className="bg-black/30 p-4 rounded-lg font-mono text-sm text-green-300 break-all">{generatedNote}</div>
                    <button onClick={() => copyNote(generatedNote)} className="mt-4 w-full py-3 bg-green-500/20 hover:bg-green-500/30 rounded-xl text-green-400 font-bold transition-colors">Copy Note</button>
                  </div>
                )}
              </div>
            )}

            {activeTab === 'send' && (
              <div className="space-y-6">
                <div>
                  <h2 className="text-2xl font-bold">Send</h2>
                  <p className="text-gray-500">Anonymous transfer to another user</p>
                </div>
                {!currentUser ? <p className="text-yellow-400">Connect wallet first</p> : (
                  <>
                    <div className="grid grid-cols-3 gap-4">
                      {DENOMINATIONS.map((pool) => (
                        <button key={pool.id} onClick={() => setSelectedPool(pool)} className={`p-4 rounded-xl border transition-all hover:scale-[1.02] active:scale-[0.98] font-semibold ${selectedPool.id === pool.id ? 'border-purple-500 bg-purple-500/10' : 'border-white/10'}`}>
                          {pool.label}
                        </button>
                      ))}
                    </div>
                    <input type="text" value={recipientPseudo} onChange={(e) => setRecipientPseudo(e.target.value)} placeholder="@username" className="w-full p-4 bg-black/30 border border-white/10 rounded-xl text-white text-lg focus:border-purple-500 focus:outline-none" />
                    <button onClick={handleSendByPseudo} disabled={loading || !recipientPseudo} className={`w-full py-4 rounded-xl font-bold text-lg transition-all ${loading ? 'bg-gray-800 text-gray-600' : 'bg-gradient-to-r from-purple-600 to-cyan-600 hover:opacity-90 active:scale-[0.99] shadow-lg shadow-purple-500/20'}`}>
                      {loading ? 'Sending...' : `Send ${selectedPool.label}`}
                    </button>
                  </>
                )}
              </div>
            )}

            {activeTab === 'withdraw' && (
              <div className="space-y-6">
                <div>
                  <h2 className="text-2xl font-bold">Withdraw</h2>
                  <p className="text-gray-500">ZK proof verification</p>
                </div>
                {agentStatus && (
                  <div className="p-4 bg-green-500/10 border border-green-500/20 rounded-xl flex items-center gap-3">
                    <span className="w-3 h-3 bg-green-400 rounded-full animate-pulse" />
                    <span className="text-green-400 font-semibold">Agent Online</span>
                    <span className="text-gray-500">•</span>
                    <span className="text-gray-400">{agentStatus.relayerCount} relayers</span>
                  </div>
                )}
                <textarea value={withdrawNote} onChange={(e) => setWithdrawNote(e.target.value)} placeholder="shadow-1-1-secret-nullifier" rows={3} className="w-full p-4 bg-black/30 border border-white/10 rounded-xl text-white font-mono text-sm focus:border-purple-500 focus:outline-none resize-none" />
                <div>
                  <input type="text" value={withdrawAddress} onChange={(e) => setWithdrawAddress(e.target.value)} placeholder="Destination Solana address" className="w-full p-4 bg-black/30 border border-white/10 rounded-xl text-white font-mono text-sm focus:border-purple-500 focus:outline-none" />
                  <p className="text-xs text-gray-500 mt-2">Use a NEW address for maximum privacy</p>
                </div>
                <button onClick={handleWithdraw} disabled={loading || !withdrawNote || !withdrawAddress} className={`w-full py-4 rounded-xl font-bold text-lg transition-all ${loading ? 'bg-gray-800 text-gray-600' : 'bg-gradient-to-r from-green-600 to-emerald-600 hover:opacity-90 active:scale-[0.99] shadow-lg shadow-green-500/20'}`}>
                  {loading ? 'Generating ZK proof...' : 'Withdraw with ZK Proof'}
                </button>
                
                {activeW.length > 0 && (
                  <div className="space-y-3 mt-6">
                    <h3 className="text-sm text-gray-400 font-bold uppercase">Pending Withdrawals</h3>
                    {activeW.map(w => (
                      <div key={w.id} className="bg-yellow-500/10 border border-yellow-500/20 rounded-xl p-4">
                        <div className="flex justify-between items-center">
                          <div>
                            <span className="font-bold text-lg">{w.amount} SOL</span>
                            {w.zkVerified && <span className="ml-2 text-xs text-green-400 font-semibold">ZK ✓</span>}
                          </div>
                          <span className="text-yellow-400 font-semibold">{w.timeRemainingFormatted || '...'}</span>
                        </div>
                        {w.delayReason && <p className="text-sm text-gray-500 mt-2">{w.delayReason}</p>}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {activeTab === 'activity' && (
              <div className="space-y-6">
                <h2 className="text-2xl font-bold">Activity</h2>
                
                {pendingTransfers.length > 0 && (
                  <div className="space-y-3">
                    <h3 className="text-sm text-gray-400 font-bold uppercase">To Claim</h3>
                    {pendingTransfers.map(t => (
                      <div key={t.id} className="bg-purple-500/10 border border-purple-500/20 rounded-xl p-4 flex justify-between items-center">
                        <div>
                          <span className="font-bold text-lg">{t.amount} SOL</span>
                          <span className="text-gray-500 ml-2">from @{t.sender_pseudo}</span>
                        </div>
                        <button onClick={() => handleClaimTransfer(t)} className="px-5 py-2.5 bg-purple-600 hover:bg-purple-500 rounded-xl font-bold transition-colors">Claim</button>
                      </div>
                    ))}
                  </div>
                )}

                {savedNotes.length > 0 && (
                  <div className="space-y-3">
                    <h3 className="text-sm text-gray-400 font-bold uppercase">My Notes</h3>
                    {savedNotes.map(n => (
                      <div key={n.id} className={`border rounded-xl p-4 ${n.status === 'withdrawn' ? 'border-white/5 opacity-50' : 'border-white/10'}`}>
                        <div className="flex justify-between mb-2">
                          <span className="font-bold text-lg">{n.amount} SOL</span>
                          <span className={`text-xs px-3 py-1 rounded-full font-semibold ${n.status === 'withdrawn' ? 'bg-gray-700 text-gray-400' : 'bg-green-500/20 text-green-400'}`}>
                            {n.status === 'withdrawn' ? 'Withdrawn' : 'Active'}
                          </span>
                        </div>
                        <div className="bg-black/30 p-3 rounded-lg font-mono text-xs text-gray-500 break-all">{n.note}</div>
                        {n.status === 'active' && (
                          <div className="flex gap-2 mt-3">
                            <button onClick={() => copyNote(n.note)} className="px-4 py-2 bg-white/5 hover:bg-white/10 rounded-lg font-semibold transition-colors">Copy</button>
                            <button onClick={() => { setWithdrawNote(n.note); setActiveTab('withdraw'); }} className="px-4 py-2 bg-purple-600/20 hover:bg-purple-600/30 text-purple-400 rounded-lg font-semibold transition-colors">Withdraw</button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
                
                {pendingTransfers.length === 0 && savedNotes.length === 0 && (
                  <div className="text-center py-12 text-gray-600">No activity yet</div>
                )}
              </div>
            )}
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            <div className="bg-[#12121a] border border-white/5 rounded-2xl p-6">
              <h3 className="text-sm text-gray-400 font-bold uppercase mb-4">Shadow Agent</h3>
              {agentStatus ? (
                <div className="space-y-3 text-sm">
                  <div className="flex justify-between"><span className="text-gray-500">Status</span><span className="text-green-400 font-semibold">Online</span></div>
                  <div className="flex justify-between"><span className="text-gray-500">Relayers</span><span className="font-semibold">{agentStatus.relayerCount}</span></div>
                  <div className="flex justify-between"><span className="text-gray-500">ZK Proofs</span><span className="text-green-400 font-semibold">Enabled</span></div>
                  <div className="flex justify-between"><span className="text-gray-500">Merkle Tree</span><span className="text-green-400 font-semibold">Enabled</span></div>
                  <div className="flex justify-between"><span className="text-gray-500">Completed</span><span className="font-semibold">{agentStatus.totalCompleted}</span></div>
                </div>
              ) : <p className="text-red-400 font-semibold">Offline</p>}
            </div>

            <div className="bg-[#12121a] border border-white/5 rounded-2xl p-6">
              <h3 className="text-sm text-gray-400 font-bold uppercase mb-4">How It Works</h3>
              <div className="space-y-3 text-sm text-gray-400">
                <p><span className="text-purple-400 font-bold">1.</span> Deposit → Added to Merkle Tree</p>
                <p><span className="text-purple-400 font-bold">2.</span> Wait for more deposits</p>
                <p><span className="text-purple-400 font-bold">3.</span> ZK proof verifies your deposit</p>
                <p><span className="text-green-400 font-bold">4.</span> Multi-hop → Untraceable</p>
              </div>
            </div>
          </div>
        </div>

        {status && (
          <div className={`fixed bottom-6 right-6 max-w-md p-5 rounded-2xl border backdrop-blur-xl shadow-2xl ${status.type === 'error' ? 'bg-red-500/10 border-red-500/20 text-red-400' : status.type === 'success' ? 'bg-green-500/10 border-green-500/20 text-green-400' : 'bg-blue-500/10 border-blue-500/20 text-blue-400'}`}>
            <pre className="whitespace-pre-wrap text-sm font-medium">{status.message}</pre>
          </div>
        )}
      </main>
    </div>
  );
}
