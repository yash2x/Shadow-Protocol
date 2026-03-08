import type { Metadata } from 'next';
import './globals.css';
import Providers from '@/providers';

export const metadata: Metadata = {
  title: 'Shadow Protocol — Anonymous SOL Transfers',
  description: 'Send SOL anonymously using ZK proofs and multi-hop routing on Solana',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" style={{ backgroundColor: '#0a0a0a' }}>
      <head>
        <link href="https://fonts.googleapis.com/css2?family=Space+Mono:wght@400;700&display=swap" rel="stylesheet" />
        <link rel="icon" type="image/png" href="/logox.png" />
        <link rel="apple-touch-icon" href="/logox.png" />
      </head>
      <body style={{ fontFamily: "'Space Mono', monospace", backgroundColor: '#0a0a0a' }}>
        <Providers>
          {children}
        </Providers>
      </body>
    </html>
  );
}
