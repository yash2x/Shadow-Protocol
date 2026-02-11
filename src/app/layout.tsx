import type { Metadata } from 'next';
import './globals.css';
import '@solana/wallet-adapter-react-ui/styles.css';
import Providers from '@/providers';

export const metadata: Metadata = {
  title: 'Shadow Protocol — Anonymous SOL Transfers',
  description: 'Send SOL anonymously using ZK proofs and multi-hop routing on Solana',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body style={{ fontFamily: "'Space Mono', monospace" }}>
        <Providers>
          {children}
        </Providers>
      </body>
    </html>
  );
}
