import { PublicKey } from '@solana/web3.js';

export const PROGRAM_ID = new PublicKey('2PcmHz9KZ3RMwru56PthFJx7vyxe7cqJUgaE7QBFKvc4');

export const POOLS = {
  0: { poolPDA: new PublicKey('83SKixTFPBaENxEGhWSiSmxRHmTkXDWEJbfUt8iaSL8t'), vaultPDA: new PublicKey('7Z7Tzi5mecDXsXyFVZMiCjYkbLBnZJyb1pVo5q7EchNX') },
  1: { poolPDA: new PublicKey('34LMAtaxeTuiXAri9fH7jf1XUHjKhH51oZDoFfACgDw9'), vaultPDA: new PublicKey('35vdWyyLuthLWgLLZTksFyBZ7kGdVzW8zgXXtk54Rvms') },
  2: { poolPDA: new PublicKey('cGhg9GRPoH3rfdiFiWQesPPGftbHQCLStQNM7yWrkRY'), vaultPDA: new PublicKey('2iWRhhSTmdxacoAAfzrfrUuntKT2CucNneX36FowYWvR') },
};

export const DENOMINATIONS = [
  { id: 0, value: 0.1, label: '0.1 SOL', ...POOLS[0] },
  { id: 1, value: 1, label: '1 SOL', ...POOLS[1] },
  { id: 2, value: 10, label: '10 SOL', ...POOLS[2] },
];

// Agent URL - localhost pour dev, ton serveur pour prod
export const AGENT_URL = process.env.NEXT_PUBLIC_AGENT_URL || 'http://localhost:3002';
