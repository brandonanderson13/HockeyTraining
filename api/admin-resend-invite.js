const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Verify the caller is a logged-in admin/coach/super_admin
  const authHeader = req.headers.authorization || '';
  const token = authHeader.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Unauthorized' });

  const { data: { user: caller }, error: authErr } = await supabase.auth.getUser(token);
  if (authErr || !caller) return res.status(401).json({ error: 'Unauthorized' });

  const { data: callerSub } = await supabase.from('subscriptions').select('role').eq('user_id', caller.id).single();
  if (!callerSub || !['admin', 'super_admin'].includes(callerSub.role)) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  const { userId, email } = req.body;
  if (!userId || !email) {
    return res.status(400).json({ error: 'userId and email are required' });
  }

  try {
    // Look up the target user's actual login history
    const { data: usersList, error: listError } = await supabase.auth.admin.listUsers();
    if (listError) throw listError;
    const targetUser = usersList.users.find(u => u.id === userId);
    if (!targetUser) return res.status(404).json({ error: 'User not found' });

    if (targetUser.last_sign_in_at) {
      return res.status(400).json({ error: 'This user has already logged in — cannot resend invite.' });
    }

    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: (process.env.SITE_URL || 'https://www.trainrhockey.com') + '/login.html'
    });
    if (resetError) throw resetError;

    res.status(200).json({ success: true });
  } catch (err) {
    console.error('Error resending invite:', err);
    res.status(500).json({ error: err.message });
  }
}
