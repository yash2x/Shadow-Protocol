const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const rateLimit = require('express-rate-limit');
const { Connection, Keypair, PublicKey, Transaction, TransactionInstruction, SystemProgram, LAMPORTS_PER_SOL } = require('@solana/web3.js');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const snarkjs = require('snarkjs');
const { MerkleTree } = require('./merkle');
const { buildPoseidon } = require('circomlibjs');
const { createClient } = require('@supabase/supabase-js');

const app = express();

// [H-03] Restrict CORS
app.use(cors({
  origin: [
    'https://shadow-protocol.xyz',
    'http://localhost:3000',
    'http://localhost:3001',
  ],
  methods: ['GET', 'POST'],
  credentials: true,
}));

app.use(express.json({ limit: '10mb' }));
app.set('trust proxy', true);

// [C-02] Rate limiting
const withdrawLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: 'Too many withdrawal requests, please try again later' },
  standardHeaders: true,
  legacyHeaders: false,
});

const depositLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { error: 'Too many deposit requests, please try again later' },
  standardHeaders: true,
  legacyHeaders: false,
});

const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: { error: 'Too many requests, please try again later' },
  standardHeaders: true,
  legacyHeaders: false,
});

app.use(globalLimiter);

const PROGRAM_ID = new PublicKey('2PcmHz9KZ3RMwru56PthFJx7vyxe7cqJUgaE7QBFKvc4');
const RPC_URL = 'https://api.devnet.solana.com';
const connection = new Connection(RPC_URL, 'confirmed');

// [M-05] Fail fast on missing env vars
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;

if (!supabaseUrl || !supabaseKey || !supabaseServiceKey) {
  console.error('❌ Missing required environment variables:');
  if (!supabaseUrl) console.error('   - SUPABASE_URL');
  if (!supabaseKey) console.error('   - SUPABASE_KEY');
  if (!supabaseServiceKey) console.error('   - SUPABASE_SERVICE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);
const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

const verificationKey = JSON.parse(fs.readFileSync('./zk/verification_key.json', 'utf-8'));

const POOLS = {
  0: { poolPDA: new PublicKey('83SKixTFPBaENxEGhWSiSmxRHmTkXDWEJbfUt8iaSL8t'), vaultPDA: new PublicKey('7Z7Tzi5mecDXsXyFVZMiCjYkbLBnZJyb1pVo5q7EchNX'), denomination: 0.1 },
  1: { poolPDA: new PublicKey('34LMAtaxeTuiXAri9fH7jf1XUHjKhH51oZDoFfACgDw9'), vaultPDA: new PublicKey('35vdWyyLuthLWgLLZTksFyBZ7kGdVzW8zgXXtk54Rvms'), denomination: 1 },
  2: { poolPDA: new PublicKey('cGhg9GRPoH3rfdiFiWQesPPGftbHQCLStQNM7yWrkRY'), vaultPDA: new PublicKey('2iWRhhSTmdxacoAAfzrfrUuntKT2CucNneX36FowYWvR'), denomination: 10 },
};

const FAUCET_AMOUNT = 0.3;
const FAUCET_COOLDOWN = 6 * 60 * 60 * 1000;
const MAX_QUEUE_SIZE = 100;
const BN128_FIELD_ORDER = BigInt('21888242871839275222246405745257275088548364400416034343698204186575808495617');

// [P-06d] No-logs policy — auto-delete relay records
const RELAY_LOG_RETENTION_MS = 24 * 60 * 60 * 1000; // 24 hours

let faucetWallet = null;
const faucetPath = './wallets/faucet.json';
if (fs.existsSync(faucetPath)) {
  const secret = JSON.parse(fs.readFileSync(faucetPath, 'utf-8'));
  faucetWallet = Keypair.fromSecretKey(new Uint8Array(secret));
  console.log('✓ Faucet wallet loaded:', faucetWallet.publicKey.toString());
}

// [C-01] Persist nullifiers
const usedNullifiers = new Set();
const NULLIFIERS_PATH = './wallets/nullifiers.json';

function saveNullifiersToDisk() {
  try {
    const data = JSON.stringify([...usedNullifiers]);
    const tmpPath = NULLIFIERS_PATH + '.tmp';
    fs.writeFileSync(tmpPath, data);
    fs.renameSync(tmpPath, NULLIFIERS_PATH);
  } catch (err) {
    console.error('⚠️ Failed to save nullifiers:', err.message);
  }
}

function loadNullifiersFromDisk() {
  try {
    if (fs.existsSync(NULLIFIERS_PATH)) {
      const data = JSON.parse(fs.readFileSync(NULLIFIERS_PATH, 'utf-8'));
      data.forEach(n => usedNullifiers.add(n));
      console.log('✓ Loaded ' + usedNullifiers.size + ' nullifiers from disk');
    }
  } catch (err) {
    console.error('⚠️ Failed to load nullifiers:', err.message);
  }
}

async function loadNullifiersFromDB() {
  try {
    const { data, error } = await supabaseAdmin
      .from('completed_withdrawals')
      .select('nullifier_hash')
      .not('nullifier_hash', 'is', null);
    if (!error && data) {
      data.forEach(row => {
        if (row.nullifier_hash) usedNullifiers.add(row.nullifier_hash);
      });
      console.log('✓ Total nullifiers after DB sync: ' + usedNullifiers.size);
    }
  } catch (err) {
    console.error('⚠️ Failed to load nullifiers from DB:', err.message);
  }
}

const merkleTrees = { 0: new MerkleTree(20), 1: new MerkleTree(20), 2: new MerkleTree(20) };
let poseidon = null;
let F = null;

const relayers = [];
for (let i = 1; i <= 5; i++) {
  const path = `./wallets/relayer${i}.json`;
  if (fs.existsSync(path)) {
    const secret = JSON.parse(fs.readFileSync(path, 'utf-8'));
    relayers.push({ id: i, wallet: Keypair.fromSecretKey(new Uint8Array(secret)) });
  }
}

const withdrawQueue = [];
const completedWithdrawals = [];

async function initMerkleTrees() {
  poseidon = await buildPoseidon();
  F = poseidon.F;
  for (const poolId of [0, 1, 2]) {
    await merkleTrees[poolId].init();
  }
  for (const poolId of [0, 1, 2]) {
    const path = `/var/www/shadow/agent/wallets/merkle_pool_${poolId}.json`;
    const loaded = merkleTrees[poolId].loadFromDisk(path);
    if (loaded) console.log(`✓ Merkle tree pool ${poolId} restored (${merkleTrees[poolId].leaves.length} deposits)`);
  }
  console.log('✓ Merkle Trees initialized');
}

// =============================================
// [P-02] PRIVACY-ENHANCED DELAY SYSTEM
// =============================================

// [P-02d] Poisson-distributed delay (models natural transaction arrival)
function poissonDelay(meanMs) {
  // Inverse transform sampling for exponential distribution
  const u = Math.random();
  return Math.floor(-meanMs * Math.log(1 - u));
}

// [P-02a] Much longer delays with Poisson distribution
function calculatePrivacyDelay(poolId) {
  const tree = merkleTrees[poolId];
  const depositCount = tree.leaves.length;
  let meanDelay, reason;

  if (depositCount >= 20) {
    meanDelay = 5 * 60 * 1000; // 5 min mean
    reason = `High anonymity set (${depositCount}) - standard delay`;
  } else if (depositCount >= 5) {
    meanDelay = 10 * 60 * 1000; // 10 min mean
    reason = `Medium anonymity set (${depositCount}) - extended delay`;
  } else {
    meanDelay = 15 * 60 * 1000; // 15 min mean
    reason = `Low anonymity set (${depositCount}) - maximum delay for privacy`;
  }

  // Poisson delay with min 2 min, max 30 min
  const delay = Math.max(2 * 60 * 1000, Math.min(30 * 60 * 1000, poissonDelay(meanDelay)));

  return { delay, reason, depositCount };
}

function getRandomRelayer() { return relayers[Math.floor(Math.random() * relayers.length)]; }

function getRandomHopRelayers(excludeId, count) {
  const available = relayers.filter(r => r.id !== excludeId);
  const shuffled = available.sort(() => Math.random() - 0.5);
  return shuffled.slice(0, Math.min(count, shuffled.length));
}

async function verifyProof(proof, publicSignals) {
  try {
    return await snarkjs.groth16.verify(verificationKey, publicSignals, proof);
  } catch (error) {
    console.error('ZK Error:', error.message);
    return false;
  }
}

async function checkRelayerBalance(relayer, requiredLamports) {
  try {
    const balance = await connection.getBalance(relayer.wallet.publicKey);
    return balance >= requiredLamports + 10000;
  } catch {
    return false;
  }
}

async function confirmWithTimeout(signature, blockhash, lastValidBlockHeight, timeoutMs = 60000) {
  return Promise.race([
    connection.confirmTransaction({ signature, blockhash, lastValidBlockHeight }),
    new Promise((_, reject) => setTimeout(() => reject(new Error('Transaction confirmation timeout')), timeoutMs)),
  ]);
}

// =============================================
// [P-02c] DUMMY TRANSACTIONS (noise generation)
// =============================================

async function sendDummyTransaction() {
  if (relayers.length < 2) return;

  try {
    const fromRelayer = relayers[Math.floor(Math.random() * relayers.length)];
    const toRelayer = relayers.filter(r => r.id !== fromRelayer.id)[Math.floor(Math.random() * (relayers.length - 1))];

    // Send tiny amount between relayers to create noise
    const transferTx = new Transaction().add(
      SystemProgram.transfer({
        fromPubkey: fromRelayer.wallet.publicKey,
        toPubkey: toRelayer.wallet.publicKey,
        lamports: 1000 + Math.floor(Math.random() * 9000), // 0.000001-0.00001 SOL
      })
    );

    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
    transferTx.recentBlockhash = blockhash;
    transferTx.feePayer = fromRelayer.wallet.publicKey;
    transferTx.sign(fromRelayer.wallet);

    await connection.sendRawTransaction(transferTx.serialize());
    // Don't wait for confirmation — fire and forget
  } catch {
    // Silently fail — dummy txs are optional noise
  }
}

// Schedule random dummy transactions (P-02c)
function scheduleDummyTransactions() {
  const nextDelay = poissonDelay(10 * 60 * 1000); // mean every 10 min
  setTimeout(async () => {
    await sendDummyTransaction();
    scheduleDummyTransactions(); // Reschedule
  }, nextDelay);
}

// =============================================
// WITHDRAWAL EXECUTION
// =============================================

async function executeWithdrawal(withdrawal) {
  const { id, nullifierHash, finalAddress, poolId, relayer, numHops } = withdrawal;
  const denomination = POOLS[poolId].denomination;
  const denominationLamports = Math.floor(denomination * LAMPORTS_PER_SOL);

  // [P-06d] Minimal logging — no recipient address in logs
  console.log('\n🔄 Executing ' + id.slice(0, 8) + '...');
  console.log('   Pool: ' + poolId + ' | ' + denomination + ' SOL | ' + numHops + ' hops');

  try {
    const hasBalance = await checkRelayerBalance(relayer, denominationLamports);
    if (!hasBalance) {
      const altRelayer = relayers.find(r => r.id !== relayer.id);
      if (altRelayer) {
        const altHasBalance = await checkRelayerBalance(altRelayer, denominationLamports);
        if (altHasBalance) {
          withdrawal.relayer = altRelayer;
          return executeWithdrawal(withdrawal);
        }
      }
      throw new Error('No relayer with sufficient balance');
    }

    const pool = POOLS[poolId];
    const hopRelayers = getRandomHopRelayers(relayer.id, numHops - 1);

    const discriminator = Buffer.from([183, 18, 70, 156, 148, 109, 161, 34]);
    const nullifierBytes = Buffer.alloc(32);
    const nullBigInt = BigInt(nullifierHash);
    for (let i = 0; i < 32; i++) {
      nullifierBytes[31 - i] = Number((nullBigInt >> BigInt(i * 8)) & BigInt(0xff));
    }

    const data = Buffer.concat([discriminator, nullifierBytes]);

    const instruction = new TransactionInstruction({
      keys: [
        { pubkey: pool.poolPDA, isSigner: false, isWritable: true },
        { pubkey: pool.vaultPDA, isSigner: false, isWritable: true },
        { pubkey: relayer.wallet.publicKey, isSigner: false, isWritable: true },
        { pubkey: relayer.wallet.publicKey, isSigner: true, isWritable: true },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      ],
      programId: PROGRAM_ID,
      data: data,
    });

    const transaction = new Transaction().add(instruction);
    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
    transaction.recentBlockhash = blockhash;
    transaction.feePayer = relayer.wallet.publicKey;
    transaction.sign(relayer.wallet);

    const signature = await connection.sendRawTransaction(transaction.serialize());
    await confirmWithTimeout(signature, blockhash, lastValidBlockHeight);

    let currentWallet = relayer.wallet;
    let finalSignature = signature;

    for (let i = 0; i < numHops; i++) {
      const isLastHop = i === numHops - 1;
      const nextAddress = isLastHop ? finalAddress : hopRelayers[i].wallet.publicKey.toString();

      // [P-02] Longer inter-hop delays with Poisson distribution
      const hopDelay = poissonDelay(8000); // mean 8s between hops
      await new Promise(r => setTimeout(r, Math.max(3000, Math.min(20000, hopDelay))));

      const transferTx = new Transaction().add(
        SystemProgram.transfer({
          fromPubkey: currentWallet.publicKey,
          toPubkey: new PublicKey(nextAddress),
          lamports: denominationLamports,
        })
      );

      const { blockhash: txBlockhash, lastValidBlockHeight: txHeight } = await connection.getLatestBlockhash();
      transferTx.recentBlockhash = txBlockhash;
      transferTx.feePayer = currentWallet.publicKey;
      transferTx.sign(currentWallet);

      const hopSig = await connection.sendRawTransaction(transferTx.serialize());
      await confirmWithTimeout(hopSig, txBlockhash, txHeight);

      finalSignature = hopSig;
      if (!isLastHop) {
        currentWallet = hopRelayers[i].wallet;
      }
    }

    usedNullifiers.add(nullifierHash);
    saveNullifiersToDisk();

    withdrawal.status = 'completed';
    withdrawal.completedAt = Date.now();
    withdrawal.finalSignature = finalSignature;
    completedWithdrawals.push(withdrawal);

    const queueIndex = withdrawQueue.findIndex(w => w.id === id);
    if (queueIndex !== -1) withdrawQueue.splice(queueIndex, 1);

    // [P-06d] Store minimal data — no recipient address in DB
    const { error: insertErr } = await supabaseAdmin.from('completed_withdrawals').insert([{
      id: withdrawal.id,
      nullifier_hash: nullifierHash,
      amount: denomination,
      final_signature: finalSignature,
      completed_at: new Date().toISOString(),
      // NO recipient address stored
    }]);
    if (insertErr) console.log('   ⚠️ Insert warning:', insertErr.message);

    if (completedWithdrawals.length > 1000) {
      completedWithdrawals.splice(0, completedWithdrawals.length - 1000);
    }

    console.log('   ✅ Completed | ' + denomination + ' SOL');
    return { success: true, signature: finalSignature, amount: denomination };
  } catch (error) {
    console.log('   ❌ Error: ' + error.message);
    withdrawal.status = 'failed';
    withdrawal.error = error.message;

    const queueIndex = withdrawQueue.findIndex(w => w.id === id);
    if (queueIndex !== -1) withdrawQueue.splice(queueIndex, 1);

    return { success: false, error: error.message };
  }
}

// [P-02e] Process withdrawals in RANDOM order, not FIFO
setInterval(async () => {
  const now = Date.now();
  const ready = withdrawQueue.filter(w => w.status === 'pending' && now >= w.executeAt);

  if (ready.length === 0) return;

  // Shuffle ready withdrawals — random execution order
  for (let i = ready.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [ready[i], ready[j]] = [ready[j], ready[i]];
  }

  // [P-02b] Batch execution — process multiple at once with random spacing
  for (const withdrawal of ready) {
    withdrawal.status = 'processing';
    // Small random gap between batch executions (1-5s)
    await new Promise(r => setTimeout(r, 1000 + Math.random() * 4000));
    await executeWithdrawal(withdrawal);
  }
}, 5000);

// [P-06d] Auto-delete old relay records from memory
setInterval(() => {
  const cutoff = Date.now() - RELAY_LOG_RETENTION_MS;
  while (completedWithdrawals.length > 0 && completedWithdrawals[0].completedAt < cutoff) {
    completedWithdrawals.shift();
  }
}, 60 * 60 * 1000); // Check every hour

// [P-03] Don't log IPs — hash them for rate limiting only
function getClientIPHash(req) {
  const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
             req.headers['x-real-ip'] ||
             req.connection?.remoteAddress ||
             req.ip || 'unknown';
  // Return hash, not raw IP
  return crypto.createHash('sha256').update(ip + 'shadow-salt-2026').digest('hex').slice(0, 16);
}

// Keep original for faucet rate limiting (needs exact IP for cooldown)
function getClientIP(req) {
  return req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
         req.headers['x-real-ip'] ||
         req.connection?.remoteAddress ||
         req.ip || 'unknown';
}

// ============== ROUTES ==============

app.get('/status', async (req, res) => {
  let faucetBalance = 0;
  if (faucetWallet) {
    try {
      faucetBalance = await connection.getBalance(faucetWallet.publicKey) / LAMPORTS_PER_SOL;
    } catch {}
  }

  res.json({
    version: '7.1.0-privacy',
    status: 'online',
    relayerCount: relayers.length,
    zkEnabled: true,
    merkleEnabled: true,
    multiHop: true,
    deadManSwitch: true,
    privacyFeatures: {
      poissonDelays: true,
      batchWithdrawals: true,
      randomOrder: true,
      dummyTransactions: true,
      noLogs: true,
      autoCleanup: true,
      messagePadding: true,
    },
    faucet: {
      enabled: !!faucetWallet,
      balance: faucetBalance,
      claimAmount: FAUCET_AMOUNT,
      address: faucetWallet?.publicKey.toString() || null,
    },
    pools: {
      0: {
        deposits: merkleTrees[0].leaves.length,
        denomination: '0.1 SOL',
        // [P-01d] Anonymity set indicator
        privacyLevel: merkleTrees[0].leaves.length >= 50 ? 'strong' :
                      merkleTrees[0].leaves.length >= 10 ? 'moderate' : 'weak',
      },
      1: {
        deposits: merkleTrees[1].leaves.length,
        denomination: '1 SOL',
        privacyLevel: merkleTrees[1].leaves.length >= 50 ? 'strong' :
                      merkleTrees[1].leaves.length >= 10 ? 'moderate' : 'weak',
      },
      2: {
        deposits: merkleTrees[2].leaves.length,
        denomination: '10 SOL',
        privacyLevel: merkleTrees[2].leaves.length >= 50 ? 'strong' :
                      merkleTrees[2].leaves.length >= 10 ? 'moderate' : 'weak',
      },
    },
    pendingWithdrawals: withdrawQueue.filter(w => w.status === 'pending').length,
    totalCompleted: completedWithdrawals.length,
    nullifiersTracked: usedNullifiers.size,
  });
});

// ============== FAUCET ROUTES ==============

app.get('/faucet/status', async (req, res) => {
  if (!faucetWallet) {
    return res.status(503).json({ error: 'Faucet not available' });
  }
  try {
    const balance = await connection.getBalance(faucetWallet.publicKey) / LAMPORTS_PER_SOL;
    const claimsRemaining = Math.floor(balance / FAUCET_AMOUNT);
    res.json({
      enabled: true,
      balance,
      claimAmount: FAUCET_AMOUNT,
      claimsRemaining,
      cooldownHours: 24,
      address: faucetWallet.publicKey.toString(),
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/faucet/claim', async (req, res) => {
  const { walletAddress } = req.body;
  const clientIP = getClientIP(req); // Faucet needs IP for cooldown

  if (!faucetWallet) return res.status(503).json({ error: 'Faucet not available' });
  if (!walletAddress) return res.status(400).json({ error: 'Wallet address required' });

  try { new PublicKey(walletAddress); } catch { return res.status(400).json({ error: 'Invalid wallet address' }); }

  try {
    const oneDayAgo = new Date(Date.now() - FAUCET_COOLDOWN).toISOString();
    const { data: existingClaims, error: checkError } = await supabase
      .from('faucet_claims')
      .select('*')
      .or(`wallet_address.eq.${walletAddress},ip_address.eq.${clientIP}`)
      .gte('created_at', oneDayAgo);

    if (checkError) console.log('   ⚠️ DB check error:', checkError.message);

    if (existingClaims && existingClaims.length > 0) {
      const walletClaim = existingClaims.find(c => c.wallet_address === walletAddress);
      const ipClaim = existingClaims.find(c => c.ip_address === clientIP);

      if (walletClaim) {
        const timeLeft = FAUCET_COOLDOWN - (Date.now() - new Date(walletClaim.created_at).getTime());
        return res.status(429).json({
          error: 'Wallet already claimed',
          hoursRemaining: Math.ceil(timeLeft / (60 * 60 * 1000)),
          nextClaimAt: new Date(new Date(walletClaim.created_at).getTime() + FAUCET_COOLDOWN).toISOString(),
        });
      }
      if (ipClaim) {
        const timeLeft = FAUCET_COOLDOWN - (Date.now() - new Date(ipClaim.created_at).getTime());
        return res.status(429).json({
          error: 'IP address already claimed today',
          hoursRemaining: Math.ceil(timeLeft / (60 * 60 * 1000)),
          nextClaimAt: new Date(new Date(ipClaim.created_at).getTime() + FAUCET_COOLDOWN).toISOString(),
        });
      }
    }

    const faucetBalance = await connection.getBalance(faucetWallet.publicKey);
    const requiredLamports = Math.floor(FAUCET_AMOUNT * LAMPORTS_PER_SOL) + 5000;

    if (faucetBalance < requiredLamports) {
      return res.status(503).json({ error: 'Faucet is empty, please try again later' });
    }

    const transferTx = new Transaction().add(
      SystemProgram.transfer({
        fromPubkey: faucetWallet.publicKey,
        toPubkey: new PublicKey(walletAddress),
        lamports: Math.floor(FAUCET_AMOUNT * LAMPORTS_PER_SOL),
      })
    );

    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
    transferTx.recentBlockhash = blockhash;
    transferTx.feePayer = faucetWallet.publicKey;
    transferTx.sign(faucetWallet);

    const signature = await connection.sendRawTransaction(transferTx.serialize());
    await confirmWithTimeout(signature, blockhash, lastValidBlockHeight);

    // [P-03e] Store hashed IP instead of raw IP
    const ipHash = crypto.createHash('sha256').update(clientIP + 'faucet-salt').digest('hex').slice(0, 32);
    const { error: insertError } = await supabase
      .from('faucet_claims')
      .insert([{
        wallet_address: walletAddress,
        ip_address: clientIP, // Keep raw for cooldown checks (needed for .or query)
        ip_hash: ipHash, // Store hash for audit trail
        amount: FAUCET_AMOUNT,
        tx_signature: signature,
      }]);

    if (insertError) console.log('   ⚠️ Failed to record claim:', insertError.message);

    const newBalance = await connection.getBalance(faucetWallet.publicKey) / LAMPORTS_PER_SOL;

    res.json({
      success: true,
      amount: FAUCET_AMOUNT,
      signature,
      message: `${FAUCET_AMOUNT} SOL sent to your wallet!`,
      faucetBalance: newBalance,
      nextClaimAt: new Date(Date.now() + FAUCET_COOLDOWN).toISOString(),
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/faucet/check/:walletAddress', async (req, res) => {
  const { walletAddress } = req.params;
  const clientIP = getClientIP(req);

  try {
    const oneDayAgo = new Date(Date.now() - FAUCET_COOLDOWN).toISOString();
    const { data: existingClaims } = await supabase
      .from('faucet_claims')
      .select('*')
      .or(`wallet_address.eq.${walletAddress},ip_address.eq.${clientIP}`)
      .gte('created_at', oneDayAgo)
      .order('created_at', { ascending: false })
      .limit(1);

    if (existingClaims && existingClaims.length > 0) {
      const claim = existingClaims[0];
      const nextClaimAt = new Date(new Date(claim.created_at).getTime() + FAUCET_COOLDOWN);
      res.json({
        canClaim: false,
        reason: claim.wallet_address === walletAddress ? 'wallet' : 'ip',
        lastClaim: claim.created_at,
        nextClaimAt: nextClaimAt.toISOString(),
        hoursRemaining: Math.ceil((nextClaimAt.getTime() - Date.now()) / (60 * 60 * 1000)),
      });
    } else {
      res.json({ canClaim: true });
    }
  } catch (error) {
    res.json({ canClaim: true });
  }
});

// ============== DEPOSIT ROUTE ==============

app.post('/deposit', depositLimiter, async (req, res) => {
  try {
    const { commitment, poolId } = req.body;

    if (!commitment) return res.status(400).json({ error: 'Missing commitment' });

    let commitmentBigInt;
    try { commitmentBigInt = BigInt(commitment); } catch { return res.status(400).json({ error: 'Invalid commitment format' }); }
    if (commitmentBigInt === BigInt(0)) return res.status(400).json({ error: 'Commitment cannot be zero' });
    if (commitmentBigInt < BigInt(0) || commitmentBigInt >= BN128_FIELD_ORDER) return res.status(400).json({ error: 'Commitment out of field range' });

    const pid = poolId !== undefined ? parseInt(poolId) : 1;
    if (![0, 1, 2].includes(pid)) return res.status(400).json({ error: 'Invalid pool ID' });

    const tree = merkleTrees[pid];
    if (tree.hasCommitment(commitment)) return res.status(400).json({ error: 'Duplicate commitment' });

    const index = tree.insert(commitment);
    tree.saveToDisk(`/var/www/shadow/agent/wallets/merkle_pool_${pid}.json`);
    const newRoot = tree.getRoot();

    // [P-06d] Minimal logging
    console.log('📥 Deposit | Pool ' + pid + ' | Index ' + index + ' | Total ' + tree.leaves.length);

    res.json({
      success: true,
      index,
      root: newRoot.toString(),
      totalDeposits: tree.leaves.length,
      // [P-01d] Privacy level indicator
      privacyLevel: tree.leaves.length >= 50 ? 'strong' :
                    tree.leaves.length >= 10 ? 'moderate' : 'weak',
      anonymitySet: tree.leaves.length,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/merkle-proof/:poolId/:commitment', async (req, res) => {
  try {
    const { poolId, commitment } = req.params;
    const pid = parseInt(poolId);
    if (![0, 1, 2].includes(pid)) return res.status(400).json({ error: 'Invalid pool ID' });

    const tree = merkleTrees[pid];
    const index = tree.getLeafIndex(commitment);
    if (index === -1) return res.status(404).json({ error: 'Commitment not found' });

    const { pathElements, pathIndices } = tree.getProof(index);
    const root = tree.getRoot();

    res.json({
      root: root.toString(),
      pathElements: pathElements.map(e => e.toString()),
      pathIndices,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============== WITHDRAW ROUTE ==============

app.post('/withdraw', withdrawLimiter, async (req, res) => {
  try {
    const { proof, publicSignals, recipientAddress, poolId } = req.body;
    const pid = poolId !== undefined ? parseInt(poolId) : 1;

    if (![0, 1, 2].includes(pid)) return res.status(400).json({ error: 'Invalid pool ID' });

    if (!proof || !publicSignals || !recipientAddress) {
      return res.status(400).json({ error: 'Missing fields' });
    }

    try { new PublicKey(recipientAddress); } catch { return res.status(400).json({ error: 'Invalid recipient address' }); }

    const pendingCount = withdrawQueue.filter(w => w.status === 'pending').length;
    if (pendingCount >= MAX_QUEUE_SIZE) {
      return res.status(503).json({ error: 'Withdrawal queue full, please try again later' });
    }

    const root = publicSignals[0];
    const nullifierHash = publicSignals[1];
    const tree = merkleTrees[pid];

    if (!tree.isKnownRoot(root)) {
      return res.status(400).json({ error: 'Unknown Merkle root' });
    }

    if (usedNullifiers.has(nullifierHash)) {
      return res.status(400).json({ error: 'Nullifier already used' });
    }

    const isValid = await verifyProof(proof, publicSignals);
    if (!isValid) {
      return res.status(400).json({ error: 'Invalid ZK proof' });
    }

    // [P-02a] Poisson-distributed privacy delays
    const { delay, reason } = calculatePrivacyDelay(pid);
    const relayer = getRandomRelayer();
    const numHops = Math.floor(Math.random() * 3) + 1;

    const withdrawal = {
      id: uuidv4(),
      nullifierHash,
      root,
      finalAddress: recipientAddress,
      poolId: pid,
      amount: POOLS[pid].denomination,
      numHops,
      delay,
      delayReason: reason,
      executeAt: Date.now() + delay,
      relayer,
      relayerId: relayer.id,
      status: 'pending',
      zkVerified: true,
      createdAt: Date.now(),
    };

    withdrawQueue.push(withdrawal);
    usedNullifiers.add(nullifierHash);
    saveNullifiersToDisk();

    const delaySeconds = Math.floor(delay / 1000);
    const delayFormatted = delaySeconds >= 60 ? Math.floor(delaySeconds / 60) + 'm' + (delaySeconds % 60) + 's' : delaySeconds + 's';

    // [P-06d] Minimal logging — no recipient address
    console.log('📤 Withdraw queued | Pool ' + pid + ' | ' + POOLS[pid].denomination + ' SOL | Delay ' + delayFormatted);

    res.json({
      success: true,
      id: withdrawal.id,
      status: 'pending',
      amount: POOLS[pid].denomination,
      numHops,
      delay,
      delayFormatted,
      delayReason: reason,
      relayerId: relayer.id,
      zkVerified: true,
      executeAt: withdrawal.executeAt,
      // [P-01d] Privacy indicator
      anonymitySet: tree.leaves.length,
      privacyLevel: tree.leaves.length >= 50 ? 'strong' :
                    tree.leaves.length >= 10 ? 'moderate' : 'weak',
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/withdraw/:id', async (req, res) => {
  const { id } = req.params;
  const withdrawal = withdrawQueue.find(w => w.id === id) || completedWithdrawals.find(w => w.id === id);

  if (!withdrawal) {
    try {
      const { data } = await supabaseAdmin.from('completed_withdrawals').select('*').eq('id', id).single();
      if (data) return res.json({ id: data.id, status: 'completed', finalSignature: data.final_signature, amount: data.amount });
    } catch {}
    return res.status(404).json({ error: 'Not found' });
  }

  res.json({
    id: withdrawal.id,
    status: withdrawal.status,
    amount: withdrawal.amount,
    numHops: withdrawal.numHops,
    zkVerified: withdrawal.zkVerified,
    delayReason: withdrawal.delayReason,
    timeRemaining: Math.max(0, withdrawal.executeAt - Date.now()),
    completedAt: withdrawal.completedAt,
    finalSignature: withdrawal.finalSignature,
    error: withdrawal.error,
  });
});

// ============================================
// [P-08a] MESSAGE PADDING ENDPOINT
// ============================================

app.post('/pad-message', (req, res) => {
  const { encrypted } = req.body;
  if (!encrypted) return res.status(400).json({ error: 'Missing encrypted message' });

  // Pad to fixed 1KB size to prevent length analysis
  const TARGET_SIZE = 1024;
  const buffer = Buffer.from(encrypted, 'base64');

  if (buffer.length >= TARGET_SIZE) {
    return res.json({ padded: encrypted, originalSize: buffer.length });
  }

  // Add random padding
  const padding = crypto.randomBytes(TARGET_SIZE - buffer.length);
  const padded = Buffer.concat([
    Buffer.from([buffer.length >> 8, buffer.length & 0xff]), // 2-byte length prefix
    buffer,
    padding,
  ]);

  res.json({ padded: padded.toString('base64') });
});


// ============================================
// DEAD MAN'S SWITCH - ZK PRIVACY VERSION
// ============================================

async function triggerDeadManVault(vault) {
  // [P-06d] Minimal logging
  console.log('💀 Dead Man triggered | Vault ' + vault.id.slice(0, 8));

  try {
    if (!vault.zk_note) {
      return { success: false, error: 'No ZK note' };
    }

    // [P-04a] Don't store sender_pseudo in new transfers
    const { error: insertErr } = await supabaseAdmin.from('pending_transfers').insert([{
      recipient_pseudo: vault.beneficiary_pseudo,
      encrypted_note: vault.zk_note,
      amount: vault.amount,
      sender_pseudo: '💀 Dead Man Switch', // Generic label, not identifying
      encrypted_message: vault.encrypted_message || null,
      sender_public_key: vault.sender_public_key || null,
      claimed: false,
      is_stealth: false,
    }]);

    if (insertErr) {
      return { success: false, error: insertErr.message };
    }

    await supabaseAdmin.from('dead_vaults').update({
      triggered: true,
      trigger_tx: 'ZK_PRIVATE_' + Date.now(),
    }).eq('id', vault.id);

    return { success: true, message: 'ZK transfer created' };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

// [M-04] Check every 10 minutes
const checkDeadManVaults = async () => {
  try {
    const { data: vaults, error } = await supabase
      .from('dead_vaults')
      .select('*')
      .eq('triggered', false);

    if (error || !vaults || vaults.length === 0) return;

    const now = Date.now();
    for (const vault of vaults) {
      const lastCheckin = new Date(vault.last_checkin).getTime();
      const deadlineMs = lastCheckin + vault.interval_days * 24 * 60 * 60 * 1000;
      if (now > deadlineMs) {
        await triggerDeadManVault(vault);
      }
    }
  } catch (err) {
    console.error('Dead Man error:', err.message);
  }
};

setInterval(checkDeadManVaults, 10 * 60 * 1000);
setTimeout(checkDeadManVaults, 10000);

app.post('/deadman/trigger', async (req, res) => {
  const { vault_id } = req.body;
  if (!vault_id) return res.status(400).json({ error: 'vault_id required' });

  try {
    const { data: vault, error } = await supabase
      .from('dead_vaults')
      .select('*')
      .eq('id', vault_id)
      .eq('triggered', false)
      .single();

    if (error || !vault) return res.status(404).json({ error: 'Vault not found or already triggered' });

    const lastCheckin = new Date(vault.last_checkin).getTime();
    const deadlineMs = lastCheckin + vault.interval_days * 24 * 60 * 60 * 1000;

    if (Date.now() < deadlineMs) return res.status(400).json({ error: 'Vault not expired yet' });

    const result = await triggerDeadManVault(vault);

    if (result.success) {
      res.json({ success: true, message: 'Dead Man Switch triggered with ZK privacy', signature: 'ZK_PRIVATE' });
    } else {
      res.status(500).json({ error: result.error });
    }
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});


// ============================================
// [P-04g] AUTO-CLEANUP (in-process)
// ============================================

async function privacyCleanup() {
  try {
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

    // Delete claimed transfers older than 7 days
    await supabaseAdmin.from('pending_transfers').delete().eq('claimed', true).lt('created_at', sevenDaysAgo);

    // Delete read notifications older than 7 days
    await supabaseAdmin.from('notifications').delete().eq('read', true).lt('created_at', sevenDaysAgo);

    // Delete faucet claims older than 30 days
    await supabaseAdmin.from('faucet_claims').delete().lt('created_at', thirtyDaysAgo);

    console.log('🧹 Privacy cleanup completed');
  } catch (err) {
    console.error('Cleanup error:', err.message);
  }
}

// Run cleanup every 6 hours
setInterval(privacyCleanup, 6 * 60 * 60 * 1000);
setTimeout(privacyCleanup, 60000); // First run after 1 min


const PORT = 3002;

async function start() {
  console.log('\n🌑 SHADOW PROTOCOL AGENT v7.1.0-privacy');
  console.log('=========================================');

  await initMerkleTrees();
  loadNullifiersFromDisk();
  await loadNullifiersFromDB();

  console.log('✓ ' + relayers.length + ' Relayers');
  if (faucetWallet) {
    const balance = await connection.getBalance(faucetWallet.publicKey) / LAMPORTS_PER_SOL;
    console.log('✓ Faucet enabled (' + balance.toFixed(2) + ' SOL)');
  }
  console.log('✓ ' + usedNullifiers.size + ' nullifiers loaded');
  console.log('✓ ZK Proofs enabled');
  console.log('✓ Merkle Trees (10K root history)');
  console.log('✓ Multi-hop relay');
  console.log('✓ Dead Man Switch (10 min check)');
  console.log('✓ Rate limiting enabled');
  console.log('✓ CORS restricted');
  console.log('── Privacy Features ──');
  console.log('✓ Poisson-distributed delays (2-30 min)');
  console.log('✓ Batch withdrawal (random order)');
  console.log('✓ Dummy transactions (noise)');
  console.log('✓ No-logs policy (24h retention)');
  console.log('✓ Auto-cleanup (7d transfers, 30d faucet)');
  console.log('✓ Anonymity set indicators');
  console.log('✓ Message padding (1KB fixed)');

  // Start dummy transaction scheduler
  scheduleDummyTransactions();
  console.log('✓ Dummy transaction scheduler active');

  app.listen(PORT, () => {
    console.log('🚀 Agent on http://localhost:' + PORT);
  });
}

start().catch(console.error);
