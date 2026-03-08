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
