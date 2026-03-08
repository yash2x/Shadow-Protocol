'use client';
import { DynamicContextProvider } from '@dynamic-labs/sdk-react-core';
import { SolanaWalletConnectors } from '@dynamic-labs/solana';

export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <DynamicContextProvider
      settings={{
        environmentId: '00079342-12c9-4350-8249-5cadea09df66',
        walletConnectors: [SolanaWalletConnectors],
        cssOverrides: `
          .dynamic-widget-inline-controls {
            background: rgba(10, 10, 15, 0.95) !important;
            border: 1px solid rgba(139, 92, 246, 0.3) !important;
            backdrop-filter: blur(20px) !important;
          }
          .dynamic-widget-inline-controls__account-control {
            background: rgba(139, 92, 246, 0.1) !important;
            border: 2px solid rgba(139, 92, 246, 0.4) !important;
          }
          .connect-button {
            background: #8B5CF6 !important;
            border: none !important;
            font-family: 'Space Mono', monospace !important;
            font-size: 10px !important;
            letter-spacing: 0.15em !important;
            text-transform: uppercase !important;
            font-weight: bold !important;
          }
          .connect-button:hover { background: #7C3AED !important; }
          .dynamic-modal {
            background: rgba(10, 10, 15, 0.98) !important;
            border: 1px solid rgba(139, 92, 246, 0.3) !important;
          }
          .wallet-list__tile {
            background: rgba(255, 255, 255, 0.02) !important;
            border: 1px solid rgba(255, 255, 255, 0.08) !important;
          }
          .wallet-list__tile:hover {
            background: rgba(139, 92, 246, 0.1) !important;
            border-color: rgba(139, 92, 246, 0.3) !important;
          }
          .email-input {
            background: rgba(0, 0, 0, 0.5) !important;
            border: 2px solid rgba(255, 255, 255, 0.1) !important;
            font-family: 'Space Mono', monospace !important;
          }
          .email-input:focus { border-color: rgba(139, 92, 246, 0.5) !important; }
          .popper-content, .dynamic-widget-card {
            background: rgba(10, 10, 15, 0.98) !important;
            border: 1px solid rgba(139, 92, 246, 0.3) !important;
          }
        `,
      }}
    >
      {children}
    </DynamicContextProvider>
  );
}
