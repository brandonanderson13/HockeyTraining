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
    // Verify caller is an admin
    const token = (req.headers.authorization || '').replace('Bearer ', '');
    if (!token) return res.status(401).json({ error: 'Unauthorized' });

    const { data: { user: caller }, error: authErr } = await supabase.auth.getUser(token);
    if (authErr || !caller) return res.status(401).json({ error: 'Invalid token' });

    const { data: callerSub } = await supabase
      .from('subscriptions')
      .select('role, organization_id')
      .eq('user_id', caller.id)
      .single();

    const isSuperAdmin = caller.email === 'brandonanderson1393@gmail.com';
    const isAdmin = isSuperAdmin || callerSub?.role === 'admin';
    if (!isAdmin) return res.status(403).json({ error: 'Forbidden' });

    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'email required' });

    // Use service role to send invite email
    const { data, error } = await supabase.auth.admin.inviteUserByEmail(email);
    if (error) throw error;

    console.log('Invite sent to:', email);
    return res.status(200).json({ success: true, userId: data.user.id });

  } catch (err) {
    console.error('invite-user error:', err);
    return res.status(500).json({ error: err.message });
  }
}
