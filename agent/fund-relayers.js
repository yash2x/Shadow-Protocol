const { Connection, Keypair, PublicKey, Transaction, SystemProgram, LAMPORTS_PER_SOL } = require('@solana/web3.js');
const fs = require('fs');

const RPC_URL = 'https://api.devnet.solana.com';
const connection = new Connection(RPC_URL, 'confirmed');

async function main() {
  // Wallet principal
  const mainWalletPath = process.env.HOME + '/.config/solana/id.json';
  const mainSecret = JSON.parse(fs.readFileSync(mainWalletPath, 'utf-8'));
  const mainWallet = Keypair.fromSecretKey(new Uint8Array(mainSecret));
  
  console.log('Wallet principal:', mainWallet.publicKey.toString());
  const mainBalance = await connection.getBalance(mainWallet.publicKey);
  console.log('Balance:', mainBalance / LAMPORTS_PER_SOL, 'SOL\n');
  
  const amountPerRelayer = 0.05 * LAMPORTS_PER_SOL; // 0.05 SOL chacun
  
  for (let i = 1; i <= 5; i++) {
    const relayerPath = `./wallets/relayer${i}.json`;
    const relayerSecret = JSON.parse(fs.readFileSync(relayerPath, 'utf-8'));
    const relayerWallet = Keypair.fromSecretKey(new Uint8Array(relayerSecret));
    
    const currentBalance = await connection.getBalance(relayerWallet.publicKey);
    
    if (currentBalance >= amountPerRelayer) {
      console.log(`Relayer ${i}: ${relayerWallet.publicKey.toString().slice(0,12)}... - Déjà funded (${currentBalance / LAMPORTS_PER_SOL} SOL)`);
      continue;
    }
    
    console.log(`Relayer ${i}: ${relayerWallet.publicKey.toString().slice(0,12)}... - Envoi 0.05 SOL...`);
    
    const transaction = new Transaction().add(
      SystemProgram.transfer({
        fromPubkey: mainWallet.publicKey,
        toPubkey: relayerWallet.publicKey,
        lamports: amountPerRelayer,
      })
    );
    
    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
    transaction.recentBlockhash = blockhash;
    transaction.feePayer = mainWallet.publicKey;
    transaction.sign(mainWallet);
    
    const signature = await connection.sendRawTransaction(transaction.serialize());
    await connection.confirmTransaction({ signature, blockhash, lastValidBlockHeight });
    
    console.log(`  ✓ TX: ${signature.slice(0, 20)}...`);
  }
  
  console.log('\nTous les relayers sont funded!');
}

main().catch(console.error);
