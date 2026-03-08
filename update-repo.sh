#!/bin/bash
# =============================================================================
# Shadow Protocol — Git Update Script
# =============================================================================
# Run this script from /var/www/shadow on your VPS
# Review each step before executing
# =============================================================================

echo "========================================="
echo "  Shadow Protocol — Repo Update"
echo "========================================="

# -------------------------------------------------
# STEP 1: Fix supabase.ts (remove hardcoded keys)
# -------------------------------------------------
echo ""
echo "[1/6] Fixing supabase.ts — removing hardcoded credentials..."

cat > src/lib/supabase.ts << 'SUPABASE_EOF'
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  throw new Error(
    '❌ Missing Supabase environment variables. ' +
    'Please set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local'
  );
}

export const supabase = createClient(supabaseUrl, supabaseKey);

export interface User {
  id: string;
  pseudo: string;
  wallet_address: string;
  avatar_url?: string;
  stealth_meta_key?: string;
  created_at: string;
}

export interface PendingTransfer {
  id: string;
  recipient_pseudo: string;
  encrypted_note: string;
  amount: number;
  sender_pseudo: string | null;
  created_at: string;
  claimed: boolean;
  claimed_at: string | null;
}

export interface Notification {
  id: string;
  recipient_pseudo: string;
  type: 'received' | 'claimed' | 'info';
  message: string;
  amount: number | null;
  sender_pseudo: string | null;
  read: boolean;
  created_at: string;
}
SUPABASE_EOF

echo "  ✅ supabase.ts fixed"

# -------------------------------------------------
# STEP 2: Create .env.example
# -------------------------------------------------
echo ""
echo "[2/6] Creating .env.example..."

cat > .env.example << 'ENVEXAMPLE_EOF'
# =============================================================================
# Shadow Protocol — Environment Variables
# =============================================================================
# Copy this file to .env.local and fill in your own values.
# NEVER commit .env.local or any file containing real keys.
# =============================================================================

# --- Solana RPC ---
NEXT_PUBLIC_SOLANA_RPC_URL=https://api.devnet.solana.com

# --- Supabase ---
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-supabase-anon-key
SUPABASE_SERVICE_KEY=your-supabase-service-role-key

# --- Relayer Agent ---
NEXT_PUBLIC_AGENT_URL=https://your-domain.com/api/agent
ENVEXAMPLE_EOF

echo "  ✅ .env.example created"

# -------------------------------------------------
# STEP 3: Remove test files from tracking
# -------------------------------------------------
echo ""
echo "[3/6] Updating .gitignore..."

# Add test files and cache to gitignore if not already there
grep -q "test-supabase.js" .gitignore || echo -e "\n# Test files\ntest-supabase.js\ntest-storage.js\nclear-cache.html" >> .gitignore

echo "  ✅ .gitignore updated"

# -------------------------------------------------
# STEP 4: Stage everything
# -------------------------------------------------
echo ""
echo "[4/6] Staging files..."

# Add all modified + new files
git add -A

# Remove test files from staging (keep them local but not in repo)
git reset HEAD test-supabase.js test-storage.js clear-cache.html 2>/dev/null

echo "  ✅ Files staged"

# -------------------------------------------------
# STEP 5: Show what will be committed
# -------------------------------------------------
echo ""
echo "[5/6] Files to be committed:"
echo "-----------------------------------------"
git status --short
echo "-----------------------------------------"

# -------------------------------------------------
# STEP 6: Commit & Push
# -------------------------------------------------
echo ""
echo "[6/6] Ready to commit. Run these commands:"
echo ""
echo '  git commit -m "feat: stealth addresses, encrypted messaging, dead man switch, Dynamic wallet integration'
echo ''
echo '  - Add Monero-style stealth addresses (tweetnacl X25519 ECDH)'
echo '  - Add end-to-end encrypted messaging (NaCl box)'
echo '  - Add dead man switch vault system'
echo '  - Integrate Dynamic SDK for embedded wallet support'
echo '  - Integrate Helius RPC'
echo '  - Add Web Audio sound design'
echo '  - Remove hardcoded credentials from supabase.ts'
echo '  - Add .env.example template'
echo '  - Update README with full documentation'
echo '  - Update .gitignore for test files"'
echo ""
echo '  git push origin main'
echo ""
echo "========================================="
echo "  Done! Review the staged files above."
echo "========================================="
