const express = require('express');
const cors = require('cors');
const { Connection, Keypair, PublicKey, Transaction, TransactionInstruction, SystemProgram, LAMPORTS_PER_SOL } = require('@solana/web3.js');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const snarkjs = require('snarkjs');
const { MerkleTree } = require('./merkle');
const { buildPoseidon } = require('circomlibjs');

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));

const PROGRAM_ID = new PublicKey('2PcmHz9KZ3RMwru56PthFJx7vyxe7cqJUgaE7QBFKvc4');
const RPC_URL = 'https://api.devnet.solana.com';
const connection = new Connection(RPC_URL, 'confirmed');

const verificationKey = JSON.parse(fs.readFileSync('./zk/verification_key.json', 'utf-8'));

const POOLS = {
  0: { poolPDA: new PublicKey('83SKixTFPBaENxEGhWSiSmxRHmTkXDWEJbfUt8iaSL8t'), vaultPDA: new PublicKey('7Z7Tzi5mecDXsXyFVZMiCjYkbLBnZJyb1pVo5q7EchNX'), denomination: 0.1 },
  1: { poolPDA: new PublicKey('34LMAtaxeTuiXAri9fH7jf1XUHjKhH51oZDoFfACgDw9'), vaultPDA: new PublicKey('35vdWyyLuthLWgLLZTksFyBZ7kGdVzW8zgXXtk54Rvms'), denomination: 1 },
  2: { poolPDA: new PublicKey('cGhg9GRPoH3rfdiFiWQesPPGftbHQCLStQNM7yWrkRY'), vaultPDA: new PublicKey('2iWRhhSTmdxacoAAfzrfrUuntKT2CucNneX36FowYWvR'), denomination: 10 }
};

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
    
    // Get hop relayers (other relayers as intermediaries)
    const hopRelayers = getRandomHopRelayers(relayer.id, numHops - 1);
    
    // Step 1: Withdraw from vault to first relayer
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
    
    // Build hop chain: relayer → hopRelayers → finalAddress
    let currentWallet = relayer.wallet;
    let finalSignature = signature;
    
    for (let i = 0; i < numHops; i++) {
      const isLastHop = i === numHops - 1;
      const nextAddress = isLastHop ? finalAddress : hopRelayers[i].wallet.publicKey.toString();
      
      // Random delay between hops
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
      
      // Next wallet is the hop relayer (not final)
      if (!isLastHop) {
        currentWallet = hopRelayers[i].wallet;
      }
    }
    
    usedNullifiers.add(nullifierHash);
    
    withdrawal.status = 'completed';
    withdrawal.completedAt = Date.now();
    withdrawal.finalSignature = finalSignature;
    completedWithdrawals.push(withdrawal);
    
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

// Routes
app.get('/status', (req, res) => {
  res.json({
    version: '6.6.0',
    status: 'online',
    relayerCount: relayers.length,
    zkEnabled: true,
    merkleEnabled: true,
    multiHop: true,
    pools: {
      0: { deposits: merkleTrees[0].leaves.length, denomination: '0.1 SOL' },
      1: { deposits: merkleTrees[1].leaves.length, denomination: '1 SOL' },
      2: { deposits: merkleTrees[2].leaves.length, denomination: '10 SOL' },
    },
    pendingWithdrawals: withdrawQueue.filter(w => w.status === 'pending').length,
    totalCompleted: completedWithdrawals.length,
  });
});

app.post('/deposit', async (req, res) => {
  try {
    const { commitment, poolId } = req.body;
    if (!commitment) return res.status(400).json({ error: 'Missing commitment' });
    
    const pid = poolId !== undefined ? parseInt(poolId) : 1;
    const tree = merkleTrees[pid];
    const index = tree.insert(commitment);
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
    const numHops = Math.floor(Math.random() * 3) + 1; // 1-3 hops
    
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

app.get('/withdraw/:id', (req, res) => {
  const { id } = req.params;
  const withdrawal = withdrawQueue.find(w => w.id === id) || completedWithdrawals.find(w => w.id === id);
  
  if (!withdrawal) return res.status(404).json({ error: 'Not found' });
  
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

const PORT = 3002;

async function start() {
  console.log('\n🌑 SHADOW PROTOCOL AGENT v6.6');
  console.log('==============================');
  
  await initMerkleTrees();
  
  console.log('✓ ' + relayers.length + ' Relayers');
  console.log('✓ ZK Proofs enabled');
  console.log('✓ Merkle Trees enabled');
  console.log('✓ Multi-hop relay (relayers as intermediaries)');
  
  app.listen(PORT, () => {
    console.log('🚀 Agent on http://localhost:' + PORT);
  });
}

start().catch(console.error);
