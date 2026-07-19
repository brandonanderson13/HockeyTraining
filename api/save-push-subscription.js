const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY,
  { auth: { persistSession: false } }
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
    if (!subscription || !subscription.endpoint) {
      return res.status(400).json({ error: 'Valid subscription with endpoint required' });
    }

    console.log('Saving push subscription for user:', user.id);

    // Check if already exists for this user
    const { data: existing } = await supabase
      .from('push_subscriptions')
      .select('id')
      .eq('user_id', user.id)
      .single();

    let result;
    if (existing) {
      // Update existing
      result = await supabase
        .from('push_subscriptions')
        .update({ subscription })
        .eq('user_id', user.id)
        .select();
      console.log('Updated existing subscription for user:', user.id);
    } else {
      // Insert new
      result = await supabase
        .from('push_subscriptions')
        .insert({ user_id: user.id, subscription })
        .select();
      console.log('Inserted new subscription for user:', user.id);
    }

    if (result.error) {
      console.error('DB error:', result.error.message, result.error.code);
      return res.status(500).json({ error: result.error.message });
    }

    console.log('Push subscription saved:', result.data?.[0]?.id);
    return res.status(200).json({ success: true, id: result.data?.[0]?.id });

  } catch (err) {
    console.error('save-push-subscription error:', err.message);
    return res.status(500).json({ error: err.message });
  }
}
