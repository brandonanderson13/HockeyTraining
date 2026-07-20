const webpush = require('web-push');
const { createClient } = require('@supabase/supabase-js');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const supabaseUrl = process.env.SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_KEY;
    const vapidPublic = process.env.VAPID_PUBLIC_KEY;
    const vapidPrivate = process.env.VAPID_PRIVATE_KEY;
    const vapidEmail = process.env.VAPID_EMAIL;

    if (!supabaseUrl || !serviceKey) return res.status(500).json({ error: 'Missing Supabase env vars' });
    if (!vapidPublic || !vapidPrivate || !vapidEmail) return res.status(500).json({ error: 'Missing VAPID env vars' });

    // Log key lengths to verify they are correct
    console.log('VAPID public key length:', vapidPublic.length);
    console.log('VAPID private key length:', vapidPrivate.length);
    console.log('VAPID email:', vapidEmail);

    webpush.setVapidDetails(
      vapidEmail.startsWith('mailto:') ? vapidEmail : 'mailto:' + vapidEmail,
      vapidPublic,
      vapidPrivate
    );

    const supabase = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

    const authHeader = req.headers.authorization || '';
    const token = authHeader.replace('Bearer ', '');
    if (!token) return res.status(401).json({ error: 'Unauthorized' });

    const { data: { user }, error: authErr } = await supabase.auth.getUser(token);
    if (authErr || !user) return res.status(401).json({ error: 'Invalid token' });

    const { userId, title, body, url } = req.body;
    if (!userId || !title) return res.status(400).json({ error: 'userId and title required' });

    const { data: subs, error: subErr } = await supabase
      .from('push_subscriptions')
      .select('id, subscription')
      .eq('user_id', userId);

    console.log('Subscriptions found:', subs?.length ?? 0);
    if (subErr) return res.status(500).json({ error: 'DB error: ' + subErr.message });
    if (!subs || subs.length === 0) return res.status(200).json({ sent: 0, message: 'No subscriptions' });

    const payload = JSON.stringify({
      title,
      body: body || '',
      url: url || '/',
      icon: '/apple-touch-icon.png',
      badge: '/apple-touch-icon.png'
    });

    let sent = 0, failed = 0;
    for (const row of subs) {
      try {
        console.log('Sending to endpoint:', row.subscription.endpoint?.slice(-30));
        await webpush.sendNotification(row.subscription, payload);
        sent++;
        console.log('Push sent OK');
      } catch (err) {
        console.error('Push error - status:', err.statusCode, 'body:', err.body, 'headers:', JSON.stringify(err.headers));
        if (err.statusCode === 404 || err.statusCode === 410) {
          await supabase.from('push_subscriptions').delete().eq('id', row.id);
          console.log('Deleted expired subscription');
        }
        failed++;
      }
    }

    return res.status(200).json({ sent, failed });

  } catch (err) {
    console.error('send-push error:', err);
    return res.status(500).json({ error: err.message || 'Internal server error' });
  }
}
