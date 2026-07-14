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
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'email required' });

    // inviteUserByEmail creates the user AND sends the invite email in one step
    const { data, error } = await supabase.auth.admin.inviteUserByEmail(email);
    if (error) throw error;

    console.log('User invited:', email, data.user.id);
    return res.status(200).json({ success: true, userId: data.user.id });

  } catch (err) {
    console.error('admin-create-user error:', err);
    return res.status(500).json({ error: err.message });
  }
}
