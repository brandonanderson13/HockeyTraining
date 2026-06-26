const { createClient } = require('@supabase/supabase-js');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // Check env vars exist
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceKey) {
    console.error('Missing env vars:', { supabaseUrl: !!supabaseUrl, serviceKey: !!serviceKey });
    return res.status(500).json({ error: 'Server configuration error — missing env vars' });
  }

  const supabase = createClient(supabaseUrl, serviceKey);

  try {
    const authHeader = req.headers.authorization || '';
    if (!authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Unauthorized — no token' });
    }

    const token = authHeader.split(' ')[1];

    const { data: { user: caller }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !caller) {
      return res.status(401).json({ error: 'Invalid token: ' + (authError?.message || 'no user') });
    }

    const { data: callerSub } = await supabase
      .from('subscriptions')
      .select('role, organization_id')
      .eq('user_id', caller.id)
      .single();

    const isSuperAdmin = caller.email === 'brandonanderson1393@gmail.com';
    const isAdmin = isSuperAdmin || callerSub?.role === 'admin';

    if (!isAdmin) {
      return res.status(403).json({ error: 'Forbidden — admin only' });
    }

    const { userId } = req.body;
    if (!userId) {
      return res.status(400).json({ error: 'userId is required' });
    }

    // Org check for non-super-admins
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

    // Delete auth user first
    const { error: deleteError } = await supabase.auth.admin.deleteUser(userId);
    if (deleteError) {
      console.error('Auth delete error:', deleteError);
      return res.status(500).json({ error: 'Auth delete failed: ' + deleteError.message });
    }

    // Clean up related data
    await supabase.from('subscriptions').delete().eq('user_id', userId);
    await supabase.from('assignments').delete().eq('player_id', userId);
    await supabase.from('goals').delete().eq('player_id', userId);

    console.log('✓ User deleted:', userId);
    return res.status(200).json({ success: true });

  } catch (error) {
    console.error('Unexpected error:', error);
    return res.status(500).json({ error: error.message || 'Internal server error' });
  }
}
