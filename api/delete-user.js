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
    // Verify caller is admin
    const token = (req.headers.authorization || '').replace('Bearer ', '');
    if (!token) return res.status(401).json({ error: 'Unauthorized' });

    const { data: { user: caller }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !caller) return res.status(401).json({ error: 'Invalid token' });

    const { data: callerSub } = await supabase
      .from('subscriptions')
      .select('role, organization_id')
      .eq('user_id', caller.id)
      .single();

    const isSuperAdmin = caller.email === 'brandonanderson1393@gmail.com';
    const isAdmin = isSuperAdmin || callerSub?.role === 'admin';
    if (!isAdmin) return res.status(403).json({ error: 'Forbidden — admin only' });

    const { userId, orgId } = req.body;
    if (!userId) return res.status(400).json({ error: 'userId is required' });

    // Org-level check for non-super admins
    if (!isSuperAdmin) {
      const { data: targetSub } = await supabase
        .from('subscriptions')
        .select('organization_id')
        .eq('user_id', userId)
        .single();
      if (targetSub?.organization_id !== callerSub?.organization_id) {
        return res.status(403).json({ error: 'Cannot delete users outside your organization' });
      }
    }

    // 1. Delete subscription and related data first
    await supabase.from('goals').delete().eq('player_id', userId);
    await supabase.from('assignments').delete().eq('player_id', userId);
    await supabase.from('push_subscriptions').delete().eq('user_id', userId);
    await supabase.from('subscriptions').delete().eq('user_id', userId);

    // 2. Delete from Auth
    const { error: deleteError } = await supabase.auth.admin.deleteUser(userId);
    if (deleteError) {
      console.error('Auth delete error:', JSON.stringify(deleteError));
      return res.status(500).json({ error: deleteError.message || JSON.stringify(deleteError) });
    }

    console.log('✓ User deleted:', userId);
    return res.status(200).json({ success: true });

  } catch (err) {
    console.error('delete-user error:', err.message || JSON.stringify(err));
    return res.status(500).json({ error: err.message || 'Unknown error' });
  }
}
