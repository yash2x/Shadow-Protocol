#!/bin/bash
# =============================================================================
# Shadow Protocol — Privacy Hardening Script
# =============================================================================
# Implements: P-01d, P-02a/b/e, P-03a/c/d, P-04a/f/g, P-05a, P-06d,
#             P-08a, P-09a
# Run from /var/www/shadow
# =============================================================================

set -e
echo ""
echo "🔒 Shadow Protocol — Privacy Hardening v7.1.0"
echo "==============================================="

# -------------------------------------------------
# STEP 1: Create RPC Proxy route (P-05a)
# -------------------------------------------------
echo ""
echo "[1/8] Creating RPC proxy route (P-05a)..."
mkdir -p src/app/api/rpc
echo "  ✅ RPC proxy directory created"

# -------------------------------------------------
# STEP 2: Reduce Nginx log retention (P-03c)
# -------------------------------------------------
echo ""
echo "[2/8] Configuring Nginx log rotation (P-03c)..."

cat > /etc/logrotate.d/nginx-shadow << 'LOGROTATE_EOF'
/var/log/nginx/access.log
/var/log/nginx/shadow-access.log {
    hourly
    rotate 24
    compress
    delaycompress
    missingok
    notifempty
    create 0640 www-data adm
    sharedscripts
    postrotate
        [ -f /var/run/nginx.pid ] && kill -USR1 $(cat /var/run/nginx.pid)
    endscript
}
LOGROTATE_EOF

echo "  ✅ Nginx logs rotate every hour, keep 24 only"

# -------------------------------------------------
# STEP 3: Create auto-cleanup cron job (P-04g)
# -------------------------------------------------
echo ""
echo "[3/8] Setting up auto-cleanup cron (P-04g)..."

# Create cleanup script
cat > /var/www/shadow/agent/cleanup.js << 'CLEANUP_EOF'
// Auto-delete old data for privacy (P-04g)
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing env vars');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function cleanup() {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  console.log('🧹 Privacy cleanup started...');

  // Delete claimed transfers older than 7 days
  const { count: transfers } = await supabase
    .from('pending_transfers')
    .delete({ count: 'exact' })
    .eq('claimed', true)
    .lt('created_at', sevenDaysAgo);
  console.log('   Deleted ' + (transfers || 0) + ' old claimed transfers');

  // Delete read notifications older than 7 days
  const { count: notifs } = await supabase
    .from('notifications')
    .delete({ count: 'exact' })
    .eq('read', true)
    .lt('created_at', sevenDaysAgo);
  console.log('   Deleted ' + (notifs || 0) + ' old read notifications');

  // Delete faucet claims older than 30 days
  const { count: faucet } = await supabase
    .from('faucet_claims')
    .delete({ count: 'exact' })
    .lt('created_at', thirtyDaysAgo);
  console.log('   Deleted ' + (faucet || 0) + ' old faucet claims');

  console.log('   ✅ Cleanup complete');
}

cleanup().catch(console.error);
CLEANUP_EOF

# Add cron job (runs daily at 3am)
(crontab -l 2>/dev/null | grep -v "cleanup.js"; echo "0 3 * * * cd /var/www/shadow/agent && SUPABASE_URL=$SUPABASE_URL SUPABASE_SERVICE_KEY=$SUPABASE_SERVICE_KEY /usr/bin/node cleanup.js >> /var/log/shadow-cleanup.log 2>&1") | crontab -

echo "  ✅ Auto-cleanup cron installed (daily 3am)"

# -------------------------------------------------
# STEP 4: Update .gitignore for new files
# -------------------------------------------------
echo ""
echo "[4/8] Updating .gitignore..."
grep -q "cleanup.js" .gitignore 2>/dev/null || echo -e "\n# Privacy cleanup logs\n/var/log/shadow-cleanup.log" >> .gitignore
echo "  ✅ .gitignore updated"

# -------------------------------------------------
# STEP 5: Summary
# -------------------------------------------------
echo ""
echo "[5/8] Files to upload and replace:"
echo "  📄 rpc-proxy-route.ts         → src/app/api/rpc/route.ts"
echo "  📄 agent-index-privacy.js     → agent/index.js"
echo "  📄 PRIVACY_AUDIT.md           → audits/2026-03-08-privacy-review.md"
echo ""

echo "[6/8] After uploading files, run:"
echo "  cp rpc-proxy-route.ts src/app/api/rpc/route.ts"
echo "  cp agent-index-privacy.js agent/index.js"
echo "  cp PRIVACY_AUDIT.md audits/2026-03-08-privacy-review.md"
echo ""

echo "[7/8] Rebuild and restart:"
echo "  npm run build"
echo "  sudo systemctl restart shadow-agent"
echo "  sudo systemctl restart shadow-protocol"
echo ""

echo "[8/8] Commit and push:"
echo '  git add -A'
echo '  git commit -m "privacy: implement privacy hardening (P-01 through P-10)"'
echo '  git push origin main'
echo ""
echo "==============================================="
echo "  🔒 Privacy hardening ready!"
echo "==============================================="
