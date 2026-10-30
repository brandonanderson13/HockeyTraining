const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const authHeader = req.headers.authorization || '';
  const token = authHeader.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Unauthorized' });

  const { data: { user: caller }, error: authErr } = await supabase.auth.getUser(token);
  if (authErr || !caller) return res.status(401).json({ error: 'Unauthorized' });

  const { data: callerSub } = await supabase.from('subscriptions').select('role').eq('user_id', caller.id).single();
  if (!callerSub || !['admin', 'super_admin'].includes(callerSub.role)) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  const { userIds } = req.body;
  if (!Array.isArray(userIds) || userIds.length === 0) {
    return res.status(400).json({ error: 'userIds array is required' });
  }

  try {
    const { data: usersList, error } = await supabase.auth.admin.listUsers();
    if (error) throw error;

    const statuses = {};
    userIds.forEach(id => {
      const u = usersList.users.find(x => x.id === id);
      statuses[id] = !!(u && u.last_sign_in_at);
    });

    res.status(200).json({ statuses });
  } catch (err) {
    console.error('Error checking user status:', err);
    res.status(500).json({ error: err.message });
  }
}
