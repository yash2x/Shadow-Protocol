#!/bin/bash
# =============================================================================
# Shadow Protocol — Security Fixes Deployment Script
# =============================================================================
# Fixes: C-01, C-02, H-01, H-02, H-03, M-01, M-02, M-03, M-04, M-05,
#        L-01, L-02, L-03, L-04
# Run from /var/www/shadow
# =============================================================================

set -e
echo ""
echo "🔒 Shadow Protocol — Security Fixes v7.0.0"
echo "============================================"

# -------------------------------------------------
# STEP 1: Install express-rate-limit (C-02 fix)
# -------------------------------------------------
echo ""
echo "[1/7] Installing express-rate-limit..."
cd /var/www/shadow/agent
npm install express-rate-limit --save
echo "  ✅ express-rate-limit installed"

# -------------------------------------------------
# STEP 2: Backup current files
# -------------------------------------------------
echo ""
echo "[2/7] Backing up current files..."
cd /var/www/shadow
cp agent/index.js agent/index.js.backup-$(date +%Y%m%d)
cp agent/merkle.js agent/merkle.js.backup-$(date +%Y%m%d)
cp src/app/api/stealth/register/route.ts src/app/api/stealth/register/route.ts.backup-$(date +%Y%m%d)
echo "  ✅ Backups created"

# -------------------------------------------------
# STEP 3: Create audits directory
# -------------------------------------------------
echo ""
echo "[3/7] Creating audits directory..."
mkdir -p audits
echo "  ✅ audits/ directory created"

# -------------------------------------------------
# STEP 4: Add backup files to .gitignore
# -------------------------------------------------
echo ""
echo "[4/7] Updating .gitignore..."
grep -q "*.backup-*" .gitignore 2>/dev/null || echo -e "\n# Backup files from security fixes\n*.backup-*" >> .gitignore
grep -q "nullifiers.json" .gitignore 2>/dev/null || echo -e "\n# Nullifier persistence (sensitive)\nagent/wallets/nullifiers.json" >> .gitignore
echo "  ✅ .gitignore updated"

# -------------------------------------------------
# STEP 5: Set up environment variables for agent
# -------------------------------------------------
echo ""
echo "[5/7] Checking agent environment..."
echo ""
echo "  ⚠️  Make sure your PM2 ecosystem or .env has these vars for the agent:"
echo "     SUPABASE_URL=your-supabase-url"
echo "     SUPABASE_KEY=your-anon-key"
echo "     SUPABASE_SERVICE_KEY=your-service-key"
echo ""

# -------------------------------------------------
# STEP 6: Show files to replace
# -------------------------------------------------
echo ""
echo "[6/7] Files to replace:"
echo "  📄 agent/index.js       ← agent-index-fixed.js"
echo "  📄 agent/merkle.js      ← agent-merkle-fixed.js"
echo "  📄 src/app/api/stealth/register/route.ts ← stealth-route-fixed.ts"
echo "  📄 audits/2026-03-08-internal-review.md  ← SECURITY_AUDIT.md"
echo ""

# -------------------------------------------------
# STEP 7: Instructions
# -------------------------------------------------
echo "[7/7] Next steps:"
echo ""
echo "  1. Upload these files to /var/www/shadow:"
echo "     - agent-index-fixed.js"
echo "     - agent-merkle-fixed.js"
echo "     - stealth-route-fixed.ts"
echo "     - SECURITY_AUDIT.md"
echo ""
echo "  2. Replace the files:"
echo "     cp agent-index-fixed.js agent/index.js"
echo "     cp agent-merkle-fixed.js agent/merkle.js"
echo "     cp stealth-route-fixed.ts src/app/api/stealth/register/route.ts"
echo "     cp SECURITY_AUDIT.md audits/2026-03-08-internal-review.md"
echo ""
echo "  3. Rebuild and restart:"
echo "     npm run build"
echo "     pm2 restart shadow-protocol"
echo "     cd agent && pm2 restart shadow-agent"
echo ""
echo "  4. Commit and push:"
echo "     cd /var/www/shadow"
echo "     git add -A"
echo "     git commit -m 'security: fix all audit findings (C-01, C-02, H-01..L-04)"
echo ""
echo "     - [C-01] Persist nullifiers to disk + DB (anti-double-spend)"
echo "     - [C-02] Add rate limiting on all endpoints"
echo "     - [H-01] Bound withdrawal queue, cleanup completed/failed"
echo "     - [H-02] Increase Merkle root history to 10,000"
echo "     - [H-03] Restrict CORS to production domain"
echo "     - [M-01] Validate deposit commitments (field range, zero, duplicates)"
echo "     - [M-04] Dead man switch check every 10 min"
echo "     - [M-05] Fail fast on missing env vars"
echo "     - [L-01] Atomic file writes for persistence"
echo "     - [L-02] Check relayer balance before withdrawal"
echo "     - [L-03] Transaction confirmation with timeout"
echo "     - [L-04] Signature verification on stealth registration'"
echo ""
echo "     git push origin main"
echo ""
echo "============================================"
echo "  🔒 Security fixes ready to deploy!"
echo "============================================"
