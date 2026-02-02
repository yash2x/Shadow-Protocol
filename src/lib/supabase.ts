import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://your-project.supabase.co';
const supabaseKey = 'REDACTED_ANON_KEY';

export const supabase = createClient(supabaseUrl, supabaseKey);

export interface User {
  id: string;
  pseudo: string;
  wallet_address: string;
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
