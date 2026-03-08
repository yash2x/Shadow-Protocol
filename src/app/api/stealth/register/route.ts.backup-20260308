import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
);

export async function POST(req: NextRequest) {
  try {
    const { walletAddress, metaKey } = await req.json();
    if (!walletAddress || !metaKey) return NextResponse.json({ error: 'Missing params' }, { status: 400 });
    const { error } = await supabase.from('users').update({ stealth_meta_key: metaKey }).eq('wallet_address', walletAddress);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
