const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const authHeader = req.headers.authorization || '';
    const token = authHeader.replace('Bearer ', '');
    if (!token) return res.status(401).json({ error: 'Unauthorized' });

    const { data: { user }, error: authErr } = await supabase.auth.getUser(token);
    if (authErr || !user) return res.status(401).json({ error: 'Invalid token' });

    const { subscription } = req.body;
    if (!subscription) return res.status(400).json({ error: 'subscription required' });

    const { error } = await supabase
      .from('push_subscriptions')
      .upsert({ user_id: user.id, subscription }, { onConflict: 'user_id,subscription' });

    if (error) throw error;

    console.log('Push subscription saved for user:', user.id);
    return res.status(200).json({ success: true });

  } catch (err) {
    console.error('save-push-subscription error:', err);
    return res.status(500).json({ error: err.message });
  }
}
