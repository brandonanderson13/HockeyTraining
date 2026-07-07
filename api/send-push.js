const webpush = require('web-push');
const { createClient } = require('@supabase/supabase-js');

webpush.setVapidDetails(
  process.env.VAPID_EMAIL,
  process.env.VAPID_PUBLIC_KEY,
  process.env.VAPID_PRIVATE_KEY
);

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

    const { userId, title, body, url } = req.body;
    if (!userId || !title) return res.status(400).json({ error: 'userId and title required' });

    // Get all push subscriptions for this user
    const { data: subs, error: subErr } = await supabase
      .from('push_subscriptions')
      .select('subscription')
      .eq('user_id', userId);

    if (subErr) throw subErr;
    if (!subs || subs.length === 0) {
      return res.status(200).json({ sent: 0, message: 'No subscriptions found' });
    }

    const payload = JSON.stringify({ title, body, url: url || '/' });
    let sent = 0;
    let failed = 0;

    for (const row of subs) {
      try {
        await webpush.sendNotification(row.subscription, payload);
        sent++;
      } catch (err) {
        console.warn('Push failed:', err.statusCode, err.message);
        // If subscription is expired/invalid, remove it
        if (err.statusCode === 404 || err.statusCode === 410) {
          await supabase
            .from('push_subscriptions')
            .delete()
            .eq('user_id', userId)
            .eq('subscription', row.subscription);
        }
        failed++;
      }
    }

    console.log(`Push sent: ${sent}, failed: ${failed} for user ${userId}`);
    return res.status(200).json({ sent, failed });

  } catch (err) {
    console.error('send-push error:', err);
    return res.status(500).json({ error: err.message });
  }
}
