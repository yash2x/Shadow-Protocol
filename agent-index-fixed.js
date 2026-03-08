const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const { Connection, Keypair, PublicKey, Transaction, TransactionInstruction, SystemProgram, LAMPORTS_PER_SOL } = require('@solana/web3.js');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const snarkjs = require('snarkjs');
const { MerkleTree } = require('./merkle');
const { buildPoseidon } = require('circomlibjs');
const { createClient } = require('@supabase/supabase-js');

const app = express();

// [H-03 FIX] Restrict CORS to production domain
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

// [C-02 FIX] Rate limiting
const withdrawLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // 10 withdrawals per 15 min per IP
  message: { error: 'Too many withdrawal requests, please try again later' },
  standardHeaders: true,
  legacyHeaders: false,
});

const depositLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20, // 20 deposits per 15 min per IP
  message: { error: 'Too many deposit requests, please try again later' },
  standardHeaders: true,
  legacyHeaders: false,
});

const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100, // 100 requests per 15 min per IP
  message: { error: 'Too many requests, please try again later' },
  standardHeaders: true,
  legacyHeaders: false,
});

app.use(globalLimiter);

const PROGRAM_ID = new PublicKey('2PcmHz9KZ3RMwru56PthFJx7vyxe7cqJUgaE7QBFKvc4');
const RPC_URL = 'https://api.devnet.solana.com';
const connection = new Connection(RPC_URL, 'confirmed');

// [M-05 FIX] Fail fast on missing env vars
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
const MAX_QUEUE_SIZE = 100; // [H-01 FIX] Maximum pending withdrawals
const BN128_FIELD_ORDER = BigInt('21888242871839275222246405745257275088548364400416034343698204186575808495617');

let faucetWallet = null;
const faucetPath = './wallets/faucet.json';
if (fs.existsSync(faucetPath)) {
  const secret = JSON.parse(fs.readFileSync(faucetPath, 'utf-8'));
  faucetWallet = Keypair.fromSecretKey(new Uint8Array(secret));
  console.log('✓ Faucet wallet loaded:', faucetWallet.publicKey.toString());
}

// [C-01 FIX] Persist nullifiers to disk + database
const usedNullifiers = new Set();
const NULLIFIERS_PATH = './wallets/nullifiers.json';

function saveNullifiersToDisk() {
  try {
    const data = JSON.stringify([...usedNullifiers]);
    const tmpPath = NULLIFIERS_PATH + '.tmp';
    fs.writeFileSync(tmpPath, data); // [L-01 FIX] Write to temp file first
    fs.renameSync(tmpPath, NULLIFIERS_PATH); // Atomic rename
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

function calculateOptimalDelay(poolId) {
  const tree = merkleTrees[poolId];
  const depositCount = tree.leaves.length;
  let delay, reason;
  if (depositCount >= 5) {
    delay = 30000 + Math.random() * 30000;
    reason = `${depositCount} deposits - fast withdrawal`;
  } else if (depositCount >= 2) {
    delay = 45000 + Math.random() * 45000;
    reason = `${depositCount} deposits - medium delay`;
  } else {
    delay = 60000 + Math.random() * 60000;
    reason = `Low activity - longer delay for privacy`;
  }
  return { delay: Math.floor(delay), reason, depositCount };
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

// [L-02 FIX] Check relayer balance before executing
async function checkRelayerBalance(relayer, requiredLamports) {
  try {
    const balance = await connection.getBalance(relayer.wallet.publicKey);
    return balance >= requiredLamports + 10000; // +10000 for fees
  } catch {
    return false;
  }
}

// [L-03 FIX] Confirm transaction with timeout
async function confirmWithTimeout(signature, blockhash, lastValidBlockHeight, timeoutMs = 60000) {
  return Promise.race([
    connection.confirmTransaction({ signature, blockhash, lastValidBlockHeight }),
    new Promise((_, reject) => setTimeout(() => reject(new Error('Transaction confirmation timeout')), timeoutMs)),
  ]);
}

async function executeWithdrawal(withdrawal) {
  const { id, nullifierHash, finalAddress, poolId, relayer, numHops } = withdrawal;
  const denomination = POOLS[poolId].denomination;
  const denominationLamports = Math.floor(denomination * LAMPORTS_PER_SOL);

  console.log('\n🔄 Executing ' + id.slice(0, 8) + '...');
  console.log('   Relayer #' + relayer.id + ' | ' + denomination + ' SOL | ' + numHops + ' hops');

  try {
    // [L-02 FIX] Check relayer balance
    const hasBalance = await checkRelayerBalance(relayer, denominationLamports);
    if (!hasBalance) {
      // Try another relayer
      const altRelayer = relayers.find(r => r.id !== relayer.id);
      if (altRelayer) {
        const altHasBalance = await checkRelayerBalance(altRelayer, denominationLamports);
        if (altHasBalance) {
          console.log('   ⚠️ Relayer #' + relayer.id + ' low balance, switching to #' + altRelayer.id);
          withdrawal.relayer = altRelayer;
          return executeWithdrawal(withdrawal);
        }
      }
      throw new Error('No relayer with sufficient balance');
    }

    const pool = POOLS[poolId];
    const hopRelayers = getRandomHopRelayers(relayer.id, numHops - 1);

    console.log('   [1/' + (numHops + 1) + '] Vault → Relayer #' + relayer.id);

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
    await confirmWithTimeout(signature, blockhash, lastValidBlockHeight); // [L-03 FIX]

    console.log('   ✓ Vault withdrawal: ' + signature.slice(0, 16) + '...');

    let currentWallet = relayer.wallet;
    let finalSignature = signature;

    for (let i = 0; i < numHops; i++) {
      const isLastHop = i === numHops - 1;
      const nextAddress = isLastHop ? finalAddress : hopRelayers[i].wallet.publicKey.toString();

      const hopDelay = 2000 + Math.random() * 3000;
      await new Promise(r => setTimeout(r, hopDelay));

      console.log('   [' + (i + 2) + '/' + (numHops + 1) + '] ' + currentWallet.publicKey.toString().slice(0, 8) + '... → ' + nextAddress.slice(0, 8) + '...');

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
      await confirmWithTimeout(hopSig, txBlockhash, txHeight); // [L-03 FIX]

      console.log('   ✓ Hop ' + (i + 1) + ': ' + hopSig.slice(0, 16) + '...');
      finalSignature = hopSig;

      if (!isLastHop) {
        currentWallet = hopRelayers[i].wallet;
      }
    }

    // [C-01 FIX] Persist nullifier
    usedNullifiers.add(nullifierHash);
    saveNullifiersToDisk();

    withdrawal.status = 'completed';
    withdrawal.completedAt = Date.now();
    withdrawal.finalSignature = finalSignature;
    completedWithdrawals.push(withdrawal);

    // [H-01 FIX] Remove from queue after completion
    const queueIndex = withdrawQueue.findIndex(w => w.id === id);
    if (queueIndex !== -1) withdrawQueue.splice(queueIndex, 1);

    // Persist to DB with nullifier hash
    const { error: insertErr } = await supabaseAdmin.from('completed_withdrawals').insert([{
      id: withdrawal.id,
      nullifier_hash: nullifierHash,
      amount: denomination,
      final_signature: finalSignature,
      completed_at: new Date().toISOString(),
    }]);
    if (insertErr) console.log('   ⚠️ Insert warning:', insertErr.message);

    // Keep only last 1000 completed withdrawals in memory
    if (completedWithdrawals.length > 1000) {
      completedWithdrawals.splice(0, completedWithdrawals.length - 1000);
    }

    console.log('   ✅ Completed! ' + denomination + ' SOL → ' + finalAddress.slice(0, 8) + '...');
    return { success: true, signature: finalSignature, amount: denomination };
  } catch (error) {
    console.log('   ❌ Error: ' + error.message);
    withdrawal.status = 'failed';
    withdrawal.error = error.message;

    // [H-01 FIX] Remove failed withdrawals from queue
    const queueIndex = withdrawQueue.findIndex(w => w.id === id);
    if (queueIndex !== -1) withdrawQueue.splice(queueIndex, 1);

    return { success: false, error: error.message };
  }
}

setInterval(async () => {
  const now = Date.now();
  // Process pending withdrawals
  for (const withdrawal of [...withdrawQueue]) { // spread to avoid mutation issues
    if (withdrawal.status === 'pending' && now >= withdrawal.executeAt) {
      withdrawal.status = 'processing';
      await executeWithdrawal(withdrawal);
    }
  }
}, 5000);

function getClientIP(req) {
  return req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
         req.headers['x-real-ip'] ||
         req.connection?.remoteAddress ||
         req.ip ||
         'unknown';
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
    version: '7.0.0',
    status: 'online',
    relayerCount: relayers.length,
    zkEnabled: true,
    merkleEnabled: true,
    multiHop: true,
    deadManSwitch: true,
    faucet: {
      enabled: !!faucetWallet,
      balance: faucetBalance,
      claimAmount: FAUCET_AMOUNT,
      address: faucetWallet?.publicKey.toString() || null,
    },
    pools: {
      0: { deposits: merkleTrees[0].leaves.length, denomination: '0.1 SOL' },
      1: { deposits: merkleTrees[1].leaves.length, denomination: '1 SOL' },
      2: { deposits: merkleTrees[2].leaves.length, denomination: '10 SOL' },
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
  const clientIP = getClientIP(req);

  console.log('\n💧 Faucet claim request:');
  console.log('   Wallet:', walletAddress?.slice(0, 8) + '...');
  console.log('   IP:', clientIP);

  if (!faucetWallet) {
    return res.status(503).json({ error: 'Faucet not available' });
  }
  if (!walletAddress) {
    return res.status(400).json({ error: 'Wallet address required' });
  }
  try {
    new PublicKey(walletAddress);
  } catch {
    return res.status(400).json({ error: 'Invalid wallet address' });
  }

  try {
    const oneDayAgo = new Date(Date.now() - FAUCET_COOLDOWN).toISOString();
    const { data: existingClaims, error: checkError } = await supabase
      .from('faucet_claims')
      .select('*')
      .or(`wallet_address.eq.${walletAddress},ip_address.eq.${clientIP}`)
      .gte('created_at', oneDayAgo);

    if (checkError) {
      console.log('   ⚠️ DB check error:', checkError.message);
    }

    if (existingClaims && existingClaims.length > 0) {
      const walletClaim = existingClaims.find(c => c.wallet_address === walletAddress);
      const ipClaim = existingClaims.find(c => c.ip_address === clientIP);

      if (walletClaim) {
        const timeLeft = FAUCET_COOLDOWN - (Date.now() - new Date(walletClaim.created_at).getTime());
        const hoursLeft = Math.ceil(timeLeft / (60 * 60 * 1000));
        console.log('   ❌ Wallet already claimed');
        return res.status(429).json({
          error: 'Wallet already claimed',
          hoursRemaining: hoursLeft,
          nextClaimAt: new Date(new Date(walletClaim.created_at).getTime() + FAUCET_COOLDOWN).toISOString(),
        });
      }
      if (ipClaim) {
        const timeLeft = FAUCET_COOLDOWN - (Date.now() - new Date(ipClaim.created_at).getTime());
        const hoursLeft = Math.ceil(timeLeft / (60 * 60 * 1000));
        console.log('   ❌ IP already claimed');
        return res.status(429).json({
          error: 'IP address already claimed today',
          hoursRemaining: hoursLeft,
          nextClaimAt: new Date(new Date(ipClaim.created_at).getTime() + FAUCET_COOLDOWN).toISOString(),
        });
      }
    }

    const faucetBalance = await connection.getBalance(faucetWallet.publicKey);
    const requiredLamports = Math.floor(FAUCET_AMOUNT * LAMPORTS_PER_SOL) + 5000;

    if (faucetBalance < requiredLamports) {
      console.log('   ❌ Faucet empty');
      return res.status(503).json({ error: 'Faucet is empty, please try again later' });
    }

    console.log('   💸 Sending', FAUCET_AMOUNT, 'SOL...');

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

    console.log('   ✅ Sent! TX:', signature.slice(0, 16) + '...');

    const { error: insertError } = await supabase
      .from('faucet_claims')
      .insert([{
        wallet_address: walletAddress,
        ip_address: clientIP,
        amount: FAUCET_AMOUNT,
        tx_signature: signature,
      }]);

    if (insertError) {
      console.log('   ⚠️ Failed to record claim:', insertError.message);
    }

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
    console.log('   ❌ Error:', error.message);
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
      const hoursRemaining = Math.ceil((nextClaimAt.getTime() - Date.now()) / (60 * 60 * 1000));
      res.json({
        canClaim: false,
        reason: claim.wallet_address === walletAddress ? 'wallet' : 'ip',
        lastClaim: claim.created_at,
        nextClaimAt: nextClaimAt.toISOString(),
        hoursRemaining,
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

    // [M-01 FIX] Validate commitment
    if (!commitment) {
      return res.status(400).json({ error: 'Missing commitment' });
    }

    let commitmentBigInt;
    try {
      commitmentBigInt = BigInt(commitment);
    } catch {
      return res.status(400).json({ error: 'Invalid commitment format' });
    }

    if (commitmentBigInt === BigInt(0)) {
      return res.status(400).json({ error: 'Commitment cannot be zero' });
    }

    if (commitmentBigInt < BigInt(0) || commitmentBigInt >= BN128_FIELD_ORDER) {
      return res.status(400).json({ error: 'Commitment out of field range' });
    }

    const pid = poolId !== undefined ? parseInt(poolId) : 1;
    if (![0, 1, 2].includes(pid)) {
      return res.status(400).json({ error: 'Invalid pool ID' });
    }

    const tree = merkleTrees[pid];

    // Check for duplicate commitment
    if (tree.hasCommitment(commitment)) {
      return res.status(400).json({ error: 'Duplicate commitment' });
    }

    const index = tree.insert(commitment);
    tree.saveToDisk(`/var/www/shadow/agent/wallets/merkle_pool_${pid}.json`);
    const newRoot = tree.getRoot();

    console.log('\n📥 Deposit registered:');
    console.log('   Pool: ' + pid + ' (' + POOLS[pid].denomination + ' SOL) | Index: ' + index);
    console.log('   Commitment: ' + commitment.toString().slice(0, 16) + '...');
    console.log('   New Root: ' + newRoot.toString().slice(0, 16) + '...');

    res.json({ success: true, index, root: newRoot.toString(), totalDeposits: tree.leaves.length });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/merkle-proof/:poolId/:commitment', async (req, res) => {
  try {
    const { poolId, commitment } = req.params;
    const pid = parseInt(poolId);

    if (![0, 1, 2].includes(pid)) {
      return res.status(400).json({ error: 'Invalid pool ID' });
    }

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

    if (![0, 1, 2].includes(pid)) {
      return res.status(400).json({ error: 'Invalid pool ID' });
    }

    console.log('\n📤 Withdraw request:');
    console.log('   Pool: ' + pid + ' | Denomination: ' + POOLS[pid].denomination + ' SOL');
    console.log('   Recipient: ' + recipientAddress?.slice(0, 8) + '...');

    if (!proof || !publicSignals || !recipientAddress) {
      return res.status(400).json({ error: 'Missing fields' });
    }

    // Validate recipient address
    try {
      new PublicKey(recipientAddress);
    } catch {
      return res.status(400).json({ error: 'Invalid recipient address' });
    }

    // [H-01 FIX] Check queue size
    const pendingCount = withdrawQueue.filter(w => w.status === 'pending').length;
    if (pendingCount >= MAX_QUEUE_SIZE) {
      return res.status(503).json({ error: 'Withdrawal queue full, please try again later' });
    }

    const root = publicSignals[0];
    const nullifierHash = publicSignals[1];

    const tree = merkleTrees[pid];

    if (!tree.isKnownRoot(root)) {
      console.log('   ⚠️ Unknown root!');
      return res.status(400).json({ error: 'Unknown Merkle root' });
    }

    if (usedNullifiers.has(nullifierHash)) {
      console.log('   ⚠️ Double-spend attempt!');
      return res.status(400).json({ error: 'Nullifier already used' });
    }

    console.log('   🔐 Verifying ZK proof...');
    const isValid = await verifyProof(proof, publicSignals);
    if (!isValid) {
      console.log('   ❌ Invalid proof!');
      return res.status(400).json({ error: 'Invalid ZK proof' });
    }
    console.log('   ✓ ZK Proof valid!');

    const { delay, reason } = calculateOptimalDelay(pid);
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

    // Immediately mark nullifier to prevent concurrent double-spend
    usedNullifiers.add(nullifierHash);
    saveNullifiersToDisk();

    const delaySeconds = Math.floor(delay / 1000);
    const delayFormatted = delaySeconds >= 60 ? Math.floor(delaySeconds / 60) + 'm' + (delaySeconds % 60) + 's' : delaySeconds + 's';

    console.log('   📥 Withdrawal scheduled:');
    console.log('   ID: ' + withdrawal.id.slice(0, 8) + '... | Relayer #' + relayer.id);
    console.log('   Amount: ' + POOLS[pid].denomination + ' SOL | Delay: ' + delayFormatted + ' | Hops: ' + numHops);

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
    });
  } catch (error) {
    console.log('   ❌ Error: ' + error.message);
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
// DEAD MAN'S SWITCH - ZK PRIVACY VERSION
// ============================================

async function triggerDeadManVault(vault) {
  console.log('\n💀 DEAD MAN TRIGGERED! Vault:', vault.id);
  console.log('   Amount:', vault.amount, 'SOL → @' + vault.beneficiary_pseudo);
  console.log('   Has encrypted message:', !!vault.encrypted_message);
  console.log('   Has sender public key:', !!vault.sender_public_key);

  try {
    if (!vault.zk_note) {
      console.error('   ❌ No ZK note found for vault');
      return { success: false, error: 'No ZK note' };
    }

    const { error: insertErr } = await supabaseAdmin.from('pending_transfers').insert([{
      recipient_pseudo: vault.beneficiary_pseudo,
      encrypted_note: vault.zk_note,
      amount: vault.amount,
      sender_pseudo: '💀 Dead Man Switch',
      encrypted_message: vault.encrypted_message || null,
      sender_public_key: vault.sender_public_key || null,
      claimed: false,
      is_stealth: false,
    }]);

    if (insertErr) {
      console.error('   ❌ Failed to create pending_transfer:', insertErr.message);
      return { success: false, error: insertErr.message };
    }

    await supabaseAdmin.from('dead_vaults').update({
      triggered: true,
      trigger_tx: 'ZK_PRIVATE_' + Date.now(),
    }).eq('id', vault.id);

    console.log('   ✅ ZK note + encrypted message sent to @' + vault.beneficiary_pseudo);
    console.log('   📥 Beneficiary can now withdraw with ZK proof from Receive tab');

    return { success: true, message: 'ZK transfer created with encrypted message' };
  } catch (error) {
    console.error('   ❌ Error:', error.message);
    return { success: false, error: error.message };
  }
}

// [M-04 FIX] Check dead man vaults every 10 minutes instead of 1 hour
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
    console.error('Dead Man Checker error:', err.message);
  }
};

setInterval(checkDeadManVaults, 10 * 60 * 1000); // Every 10 minutes
setTimeout(checkDeadManVaults, 10000);
console.log('✓ Dead Man Switch checker enabled (every 10 min, ZK privacy mode)');


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

    if (error || !vault) {
      return res.status(404).json({ error: 'Vault not found or already triggered' });
    }

    const lastCheckin = new Date(vault.last_checkin).getTime();
    const deadlineMs = lastCheckin + vault.interval_days * 24 * 60 * 60 * 1000;

    if (Date.now() < deadlineMs) {
      return res.status(400).json({ error: 'Vault not expired yet' });
    }

    const result = await triggerDeadManVault(vault);

    if (result.success) {
      res.json({
        success: true,
        message: 'Dead Man Switch triggered with ZK privacy',
        signature: 'ZK_PRIVATE',
      });
    } else {
      res.status(500).json({ error: result.error });
    }
  } catch (e) {
    console.error('Dead Man trigger error:', e.message);
    res.status(500).json({ error: e.message });
  }
});


const PORT = 3002;

async function start() {
  console.log('\n🌑 SHADOW PROTOCOL AGENT v7.0.0');
  console.log('================================');

  await initMerkleTrees();

  // [C-01 FIX] Load nullifiers from disk and DB
  loadNullifiersFromDisk();
  await loadNullifiersFromDB();

  console.log('✓ ' + relayers.length + ' Relayers');
  if (faucetWallet) {
    const balance = await connection.getBalance(faucetWallet.publicKey) / LAMPORTS_PER_SOL;
    console.log('✓ Faucet enabled (' + balance.toFixed(2) + ' SOL)');
  }
  console.log('✓ ' + usedNullifiers.size + ' nullifiers loaded (anti-double-spend)');
  console.log('✓ ZK Proofs enabled');
  console.log('✓ Merkle Trees enabled');
  console.log('✓ Multi-hop relay');
  console.log('✓ Dead Man Switch (ZK + encrypted messages)');
  console.log('✓ Rate limiting enabled');
  console.log('✓ CORS restricted to production');

  app.listen(PORT, () => {
    console.log('🚀 Agent on http://localhost:' + PORT);
  });
}

start().catch(console.error);
