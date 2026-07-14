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

    const { data: { user: caller } } = await supabase.auth.getUser(token);
    if (!caller) return res.status(401).json({ error: 'Invalid token' });

    const { data: callerSub } = await supabase
      .from('subscriptions')
      .select('role, organization_id')
      .eq('user_id', caller.id)
      .single();

    const isSuperAdmin = caller.email === 'brandonanderson1393@gmail.com';
    const isAdmin = isSuperAdmin || callerSub?.role === 'admin';
    if (!isAdmin) return res.status(403).json({ error: 'Forbidden' });

    const { users, teamId, orgId } = req.body;
    if (!users?.length) return res.status(400).json({ error: 'No users provided' });

    const created = [];
    const skipped = [];
    const errors = [];

    for (const user of users) {
      const email = user.email?.trim().toLowerCase();
      if (!email) { errors.push({ email: 'unknown', reason: 'Missing email' }); continue; }

      try {
        // Check if already exists
        const { data: existing } = await supabase
          .from('subscriptions')
          .select('id')
          .eq('email', email)
          .single();

        if (existing) { skipped.push(email); continue; }

        // Invite user — creates account and sends branded invite email
        const { data: authData, error: authError } = await supabase.auth.admin.inviteUserByEmail(email);
        if (authError) throw authError;

        // Create subscription
        const { error: subError } = await supabase.from('subscriptions').insert({
          user_id: authData.user.id,
          email,
          first_name: user.first_name || user.firstName || '',
          last_name: user.last_name || user.lastName || '',
          organization_id: orgId || 'individual',
          status: 'active',
          role: user.role || 'player',
          subscription_type: 'association',
          team_id: teamId || user.team_id || null,
          force_password_reset: true
        });

        if (subError) {
          // Rollback auth user
          await supabase.auth.admin.deleteUser(authData.user.id).catch(() => {});
          throw subError;
        }

        created.push(email);
        console.log('Bulk invited:', email);

      } catch (err) {
        errors.push({ email, reason: err.message });
        console.error('Bulk create error for', email, err.message);
      }
    }

    return res.status(200).json({ created, skipped, errors });

  } catch (err) {
    console.error('bulk-create-users error:', err);
    return res.status(500).json({ error: err.message });
  }
}
