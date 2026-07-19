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
    if (authErr || !user) {
      console.error('Auth error:', authErr?.message);
      return res.status(401).json({ error: 'Invalid token' });
    }

    const { subscription } = req.body;
    if (!subscription || !subscription.endpoint) {
      return res.status(400).json({ error: 'Valid subscription with endpoint required' });
    }

    console.log('Saving push subscription for user:', user.id);
    console.log('Endpoint:', subscription.endpoint.slice(-30));

    // Delete existing first
    const { error: delError } = await supabase
      .from('push_subscriptions')
      .delete()
      .eq('user_id', user.id);
    
    if (delError) {
      console.error('Delete error:', delError.message, delError.code);
    } else {
      console.log('Deleted existing subscriptions for user:', user.id);
    }

    // Insert new
    const { data: insertData, error: insertError } = await supabase
      .from('push_subscriptions')
      .insert({ user_id: user.id, subscription })
      .select();

    if (insertError) {
      console.error('Insert error:', insertError.message, insertError.code, insertError.details);
      return res.status(500).json({ error: insertError.message, code: insertError.code, details: insertError.details });
    }

    console.log('Push subscription inserted:', JSON.stringify(insertData));
    return res.status(200).json({ success: true, id: insertData?.[0]?.id });

  } catch (err) {
    console.error('save-push-subscription error:', err.message);
    return res.status(500).json({ error: err.message });
  }
}
