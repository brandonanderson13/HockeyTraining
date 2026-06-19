const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Verify the caller is an authenticated admin
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const token = authHeader.split(' ')[1];

  // Verify the caller's JWT and check their role
  const { data: { user: caller }, error: authError } = await supabase.auth.getUser(token);
  if (authError || !caller) {
    return res.status(401).json({ error: 'Invalid token' });
  }

  // Check caller is admin or super_admin
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

  const { userId, orgId } = req.body;

  if (!userId) {
    return res.status(400).json({ error: 'userId is required' });
  }

  // Ensure admin can only delete users in their own org (unless super admin)
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

  try {
    // 1. Delete from Supabase Auth
    const { error: deleteError } = await supabase.auth.admin.deleteUser(userId);
    if (deleteError) throw deleteError;

    // 2. Delete subscription row
    await supabase.from('subscriptions').delete().eq('user_id', userId);

    // 3. Clean up related data
    await supabase.from('assignments').delete().eq('player_id', userId);
    await supabase.from('goals').delete().eq('player_id', userId);

    console.log('✓ User deleted:', userId);
    return res.status(200).json({ success: true });

  } catch (error) {
    console.error('Error deleting user:', error);
    return res.status(500).json({ error: error.message });
  }
}
