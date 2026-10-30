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

  const { subId, userId, newEmail } = req.body;
  if (!subId || !userId || !newEmail) {
    return res.status(400).json({ error: 'subId, userId, and newEmail are required' });
  }

  const trimmedEmail = String(newEmail).trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
    return res.status(400).json({ error: 'That does not look like a valid email address' });
  }

  try {
    // Only allow this for users who have never actually logged in
    const { data: usersList, error: listError } = await supabase.auth.admin.listUsers();
    if (listError) throw listError;
    const targetUser = usersList.users.find(u => u.id === userId);
    if (!targetUser) return res.status(404).json({ error: 'User not found' });

    if (targetUser.last_sign_in_at) {
      return res.status(400).json({ error: 'This user has already logged in — email can no longer be changed this way.' });
    }

    // Make sure the new email isn't already in use by someone else
    const emailTaken = usersList.users.find(u => u.id !== userId && u.email?.toLowerCase() === trimmedEmail);
    if (emailTaken) {
      return res.status(400).json({ error: 'That email is already in use by another account.' });
    }

    // Update the auth account's email
    const { error: updateAuthError } = await supabase.auth.admin.updateUserById(userId, {
      email: trimmedEmail,
      email_confirm: true
    });
    if (updateAuthError) throw updateAuthError;

    // Keep the subscriptions table in sync
    const { error: updateSubError } = await supabase.from('subscriptions')
      .update({ email: trimmedEmail })
      .eq('id', subId);
    if (updateSubError) throw updateSubError;

    // Send a fresh invite to the corrected address right away
    await supabase.auth.resetPasswordForEmail(trimmedEmail, {
      redirectTo: (process.env.SITE_URL || 'https://www.trainrhockey.com') + '/login.html'
    });

    res.status(200).json({ success: true, email: trimmedEmail });
  } catch (err) {
    console.error('Error editing email:', err);
    res.status(500).json({ error: err.message });
  }
}
