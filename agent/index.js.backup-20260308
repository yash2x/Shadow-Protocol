const express = require('express');
const cors = require('cors');
const { Connection, Keypair, PublicKey, Transaction, TransactionInstruction, SystemProgram, LAMPORTS_PER_SOL } = require('@solana/web3.js');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const snarkjs = require('snarkjs');
const { MerkleTree } = require('./merkle');
const { buildPoseidon } = require('circomlibjs');
const { createClient } = require('@supabase/supabase-js');

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));

app.set('trust proxy', true);

const PROGRAM_ID = new PublicKey('2PcmHz9KZ3RMwru56PthFJx7vyxe7cqJUgaE7QBFKvc4');
const RPC_URL = 'https://api.devnet.solana.com';
const connection = new Connection(RPC_URL, 'confirmed');

const supabaseUrl = process.env.SUPABASE_URL || 'https://your-project.supabase.co';
const supabaseKey = process.env.SUPABASE_KEY || 'REDACTED_ANON_KEY';
const supabase = createClient(supabaseUrl, supabaseKey);
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY || 'REDACTED_SERVICE_KEY';
const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

const verificationKey = JSON.parse(fs.readFileSync('./zk/verification_key.json', 'utf-8'));

const POOLS = {
  0: { poolPDA: new PublicKey('83SKixTFPBaENxEGhWSiSmxRHmTkXDWEJbfUt8iaSL8t'), vaultPDA: new PublicKey('7Z7Tzi5mecDXsXyFVZMiCjYkbLBnZJyb1pVo5q7EchNX'), denomination: 0.1 },
  1: { poolPDA: new PublicKey('34LMAtaxeTuiXAri9fH7jf1XUHjKhH51oZDoFfACgDw9'), vaultPDA: new PublicKey('35vdWyyLuthLWgLLZTksFyBZ7kGdVzW8zgXXtk54Rvms'), denomination: 1 },
  2: { poolPDA: new PublicKey('cGhg9GRPoH3rfdiFiWQesPPGftbHQCLStQNM7yWrkRY'), vaultPDA: new PublicKey('2iWRhhSTmdxacoAAfzrfrUuntKT2CucNneX36FowYWvR'), denomination: 10 }
};

const FAUCET_AMOUNT = 0.3;
const FAUCET_COOLDOWN = 6 * 60 * 60 * 1000;

let faucetWallet = null;
const faucetPath = './wallets/faucet.json';
if (fs.existsSync(faucetPath)) {
  const secret = JSON.parse(fs.readFileSync(faucetPath, 'utf-8'));
  faucetWallet = Keypair.fromSecretKey(new Uint8Array(secret));
  console.log('✓ Faucet wallet loaded:', faucetWallet.publicKey.toString());
}

const usedNullifiers = new Set();
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

async function executeWithdrawal(withdrawal) {
  const { id, nullifierHash, finalAddress, poolId, relayer, numHops } = withdrawal;

  const denomination = POOLS[poolId].denomination;
  const denominationLamports = Math.floor(denomination * LAMPORTS_PER_SOL);

  console.log('\n🔄 Executing ' + id.slice(0, 8) + '...');
  console.log('   Relayer #' + relayer.id + ' | ' + denomination + ' SOL | ' + numHops + ' hops');

  try {
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
    await connection.confirmTransaction({ signature, blockhash, lastValidBlockHeight });

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
      await connection.confirmTransaction({ signature: hopSig, blockhash: txBlockhash, lastValidBlockHeight: txHeight });

      console.log('   ✓ Hop ' + (i + 1) + ': ' + hopSig.slice(0, 16) + '...');
      finalSignature = hopSig;

      if (!isLastHop) {
        currentWallet = hopRelayers[i].wallet;
      }
    }

    usedNullifiers.add(nullifierHash);

    withdrawal.status = 'completed';
    withdrawal.completedAt = Date.now();
    withdrawal.finalSignature = finalSignature;
    completedWithdrawals.push(withdrawal);

    // Persister en base pour survivre aux restarts
    const { error: insertErr } = await supabaseAdmin.from('completed_withdrawals').insert([{
      id: withdrawal.id,
      amount: denomination,
      final_signature: finalSignature,
      completed_at: new Date().toISOString(),
    }]);
    if (insertErr) console.log('   ⚠️ Insert warning:', insertErr.message);

    console.log('   ✅ Completed! ' + denomination + ' SOL → ' + finalAddress.slice(0, 8) + '...');

    return { success: true, signature: finalSignature, amount: denomination };
  } catch (error) {
    console.log('   ❌ Error: ' + error.message);
    withdrawal.status = 'failed';
    withdrawal.error = error.message;
    return { success: false, error: error.message };
  }
}

setInterval(async () => {
  const now = Date.now();
  for (const withdrawal of withdrawQueue) {
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
    version: '6.9.0',
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
      address: faucetWallet?.publicKey.toString() || null
    },
    pools: {
      0: { deposits: merkleTrees[0].leaves.length, denomination: '0.1 SOL' },
      1: { deposits: merkleTrees[1].leaves.length, denomination: '1 SOL' },
      2: { deposits: merkleTrees[2].leaves.length, denomination: '10 SOL' },
    },
    pendingWithdrawals: withdrawQueue.filter(w => w.status === 'pending').length,
    totalCompleted: completedWithdrawals.length,
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
      address: faucetWallet.publicKey.toString()
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
          nextClaimAt: new Date(new Date(walletClaim.created_at).getTime() + FAUCET_COOLDOWN).toISOString()
        });
      }

      if (ipClaim) {
        const timeLeft = FAUCET_COOLDOWN - (Date.now() - new Date(ipClaim.created_at).getTime());
        const hoursLeft = Math.ceil(timeLeft / (60 * 60 * 1000));
        console.log('   ❌ IP already claimed');
        return res.status(429).json({
          error: 'IP address already claimed today',
          hoursRemaining: hoursLeft,
          nextClaimAt: new Date(new Date(ipClaim.created_at).getTime() + FAUCET_COOLDOWN).toISOString()
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
    await connection.confirmTransaction({ signature, blockhash, lastValidBlockHeight });

    console.log('   ✅ Sent! TX:', signature.slice(0, 16) + '...');

    const { error: insertError } = await supabase
      .from('faucet_claims')
      .insert([{
        wallet_address: walletAddress,
        ip_address: clientIP,
        amount: FAUCET_AMOUNT,
        tx_signature: signature
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
      nextClaimAt: new Date(Date.now() + FAUCET_COOLDOWN).toISOString()
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
        hoursRemaining
      });
    } else {
      res.json({
        canClaim: true
      });
    }
  } catch (error) {
    res.json({ canClaim: true });
  }
});

// ============== EXISTING ROUTES ==============

app.post('/deposit', async (req, res) => {
  try {
    const { commitment, poolId } = req.body;
    if (!commitment) return res.status(400).json({ error: 'Missing commitment' });

    const pid = poolId !== undefined ? parseInt(poolId) : 1;
    const tree = merkleTrees[pid];
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

app.post('/withdraw', async (req, res) => {
  try {
    const { proof, publicSignals, recipientAddress, poolId } = req.body;

    const pid = poolId !== undefined ? parseInt(poolId) : 1;

    console.log('\n📤 Withdraw request:');
    console.log('   Pool: ' + pid + ' | Denomination: ' + POOLS[pid].denomination + ' SOL');
    console.log('   Recipient: ' + recipientAddress.slice(0, 8) + '...');

    if (!proof || !publicSignals || !recipientAddress) {
      return res.status(400).json({ error: 'Missing fields' });
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
    // Chercher en base si pas en mémoire (après restart agent)
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

    // Créer un pending_transfer avec le message crypté et la clé publique
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

    // Marquer le vault comme triggered
    await supabase.from('dead_vaults').update({ 
      triggered: true, 
      trigger_tx: 'ZK_PRIVATE_' + Date.now()
    }).eq('id', vault.id);

    console.log('   ✅ ZK note + encrypted message sent to @' + vault.beneficiary_pseudo);
    console.log('   📥 Beneficiary can now withdraw with ZK proof from Receive tab');

    return { success: true, message: 'ZK transfer created with encrypted message' };
  } catch (error) {
    console.error('   ❌ Error:', error.message);
    return { success: false, error: error.message };
  }
}

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

setInterval(checkDeadManVaults, 60 * 60 * 1000);
setTimeout(checkDeadManVaults, 10000);
console.log('✓ Dead Man Switch checker enabled (ZK privacy mode)');


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
        signature: 'ZK_PRIVATE'
      });
    } else {
      res.status(500).json({ error: result.error });
    }
  } catch(e) {
    console.error('Dead Man trigger error:', e.message);
    res.status(500).json({ error: e.message });
  }
});


const PORT = 3002;

async function start() {
  console.log('\n🌑 SHADOW PROTOCOL AGENT v6.9.0');
  console.log('================================');

  await initMerkleTrees();

  console.log('✓ ' + relayers.length + ' Relayers');
  if (faucetWallet) {
    const balance = await connection.getBalance(faucetWallet.publicKey) / LAMPORTS_PER_SOL;
    console.log('✓ Faucet enabled (' + balance.toFixed(2) + ' SOL)');
  }
  console.log('✓ ZK Proofs enabled');
  console.log('✓ Merkle Trees enabled');
  console.log('✓ Multi-hop relay');
  console.log('✓ Dead Man Switch (ZK + encrypted messages)');

  app.listen(PORT, () => {
    console.log('🚀 Agent on http://localhost:' + PORT);
  });
}

start().catch(console.error);
