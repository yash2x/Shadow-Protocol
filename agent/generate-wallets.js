const { Keypair } = require('@solana/web3.js');
const fs = require('fs');

console.log('Génération de 5 wallets relayers...\n');

for (let i = 1; i <= 5; i++) {
  const wallet = Keypair.generate();
  const path = `./wallets/relayer${i}.json`;
  fs.writeFileSync(path, JSON.stringify(Array.from(wallet.secretKey)));
  console.log(`Relayer ${i}: ${wallet.publicKey.toString()}`);
}

console.log('\nWallets générés dans ./wallets/');
