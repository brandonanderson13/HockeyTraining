const webpush = require('web-push');
const { createClient } = require('@supabase/supabase-js');

webpush.setVapidDetails(
  process.env.VAPID_EMAIL,
  process.env.VAPID_PUBLIC_KEY,
  process.env.VAPID_PRIVATE_KEY
);

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const supabaseUrl = process.env.SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !serviceKey) {
      return res.status(500).json({ error: 'Missing env vars' });
    }

    // Use service role client — bypasses RLS completely
    const supabase = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false }
    });

    // Verify caller token
    const authHeader = req.headers.authorization || '';
    const token = authHeader.replace('Bearer ', '');
    if (!token) return res.status(401).json({ error: 'Unauthorized' });

    const { data: { user }, error: authErr } = await supabase.auth.getUser(token);
    if (authErr || !user) return res.status(401).json({ error: 'Invalid token' });

    const { userId, title, body, url } = req.body;
    if (!userId || !title) return res.status(400).json({ error: 'userId and title required' });

    console.log('Fetching subscriptions for userId:', userId);

    // Query without .single() to avoid 406
    const { data: subs, error: subErr } = await supabase
      .from('push_subscriptions')
      .select('id, subscription')
      .eq('user_id', userId);

    console.log('Subscriptions found:', subs?.length ?? 0, 'error:', subErr?.message);

    if (subErr) {
      return res.status(500).json({ error: 'DB error: ' + subErr.message });
    }

    if (!subs || subs.length === 0) {
      return res.status(200).json({ sent: 0, message: 'No subscriptions found for ' + userId });
    }

    const payload = JSON.stringify({
      title,
      body: body || '',
      url: url || '/',
      icon: '/apple-touch-icon.png'
    });

    let sent = 0;
    let failed = 0;

    for (const row of subs) {
      try {
        await webpush.sendNotification(row.subscription, payload);
        sent++;
        console.log('Push sent successfully to subscription', row.id);
      } catch (err) {
        console.warn('Push failed:', err.statusCode, err.message);
        if (err.statusCode === 404 || err.statusCode === 410) {
          await supabase.from('push_subscriptions').delete().eq('id', row.id);
          console.log('Deleted expired subscription:', row.id);
        }
        failed++;
      }
    }

    console.log('Push result — sent:', sent, 'failed:', failed);
    return res.status(200).json({ sent, failed });

  } catch (err) {
    console.error('send-push error:', err);
    return res.status(500).json({ error: err.message || 'Internal server error' });
  }
}
