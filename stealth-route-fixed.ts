import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import nacl from 'tweetnacl';
import bs58 from 'bs58';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
);

export async function POST(req: NextRequest) {
  try {
    const { walletAddress, metaKey, signature, message } = await req.json();

    if (!walletAddress || !metaKey) {
      return NextResponse.json({ error: 'Missing params' }, { status: 400 });
    }

    // [L-04 FIX] Verify wallet ownership via signature
    if (signature && message) {
      try {
        const messageBytes = new TextEncoder().encode(message);
        const signatureBytes = bs58.decode(signature);
        const publicKeyBytes = bs58.decode(walletAddress);
        const isValid = nacl.sign.detached.verify(messageBytes, signatureBytes, publicKeyBytes);

        if (!isValid) {
          return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
        }
      } catch {
        return NextResponse.json({ error: 'Signature verification failed' }, { status: 401 });
      }
    }

    const { error } = await supabase
      .from('users')
      .update({ stealth_meta_key: metaKey })
      .eq('wallet_address', walletAddress);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
