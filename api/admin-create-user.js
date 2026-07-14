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
    const { email, skipInvite } = req.body;
    if (!email) return res.status(400).json({ error: 'email required' });

    if (skipInvite) {
      // Step 1: Create user without sending email
      const { data, error } = await supabase.auth.admin.createUser({
        email,
        email_confirm: true
      });
      if (error) throw error;
      console.log('User created:', email, data.user.id);
      return res.status(200).json({ success: true, userId: data.user.id });

    } else {
      // Step 2: Send invite email using generateLink (works for existing users)
      const { data, error } = await supabase.auth.admin.generateLink({
        type: 'invite',
        email
      });
      if (error) throw error;

      // Send the email via Resend using the generated link
      const inviteLink = data.properties?.action_link;
      const emailRes = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.RESEND_API_KEY}`
        },
        body: JSON.stringify({
          from: 'TRAINR <noreply@trainrhockey.com>',
          to: [email],
          subject: 'Your TRAINR account is ready',
          html: getInviteEmailHtml(inviteLink)
        })
      });

      if (!emailRes.ok) {
        const emailErr = await emailRes.json();
        throw new Error('Email send failed: ' + JSON.stringify(emailErr));
      }

      console.log('Invite email sent to:', email);
      return res.status(200).json({ success: true });
    }

  } catch (err) {
    console.error('admin-create-user error:', err);
    return res.status(500).json({ error: err.message });
  }
}

function getInviteEmailHtml(inviteLink) {
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#0d0d0d;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
    <tr>
      <td align="center" style="padding:48px 20px;">
        <table width="540" cellpadding="0" cellspacing="0" role="presentation" style="max-width:540px;width:100%;">
          <tr>
            <td style="padding-bottom:32px;text-align:center;">
              <img src="https://www.trainrhockey.com/apple-touch-icon.png" alt="TRAINR" style="width:72px;height:72px;object-fit:contain;display:block;margin:0 auto;">
            </td>
          </tr>
          <tr>
            <td style="background:#141414;border-radius:12px;padding:44px 40px;border:1px solid #2a2a2a;">
              <div style="width:52px;height:52px;border-radius:50%;background:rgba(59,130,246,0.12);border:1px solid rgba(59,130,246,0.25);margin:0 auto 28px;text-align:center;line-height:52px;font-size:22px;">🏒</div>
              <h1 style="color:#ffffff;font-size:22px;font-weight:700;margin:0 0 12px;text-align:center;">An account has been set up for you</h1>
              <p style="color:rgba(255,255,255,0.5);font-size:14px;line-height:1.7;margin:0 0 32px;text-align:center;">You've been added to TRAINR. Click the button below to activate your account and sign in to your training program.</p>
              <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
                <tr>
                  <td align="center" style="padding-bottom:32px;">
                    <a href="${inviteLink}" style="display:inline-block;background:#2563EB;color:#ffffff;font-size:15px;font-weight:600;text-decoration:none;padding:14px 44px;border-radius:8px;">Activate my account</a>
                  </td>
                </tr>
              </table>
              <div style="background:#0d0d0d;border-radius:8px;padding:20px 20px 12px;margin-bottom:28px;">
                <p style="color:rgba(255,255,255,0.35);font-size:11px;text-transform:uppercase;letter-spacing:.07em;font-weight:700;margin:0 0 14px;">What's included</p>
                <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
                  <tr><td style="padding:7px 0;border-bottom:1px solid #1e1e1e;"><span style="color:#3B82F6;font-size:13px;font-weight:600;">52-week training program</span><span style="color:rgba(255,255,255,0.35);font-size:12px;"> — personalized to your position and level</span></td></tr>
                  <tr><td style="padding:7px 0;border-bottom:1px solid #1e1e1e;"><span style="color:#3B82F6;font-size:13px;font-weight:600;">Goal tracking</span><span style="color:rgba(255,255,255,0.35);font-size:12px;"> — goals and milestones from your coaching staff</span></td></tr>
                  <tr><td style="padding:7px 0;border-bottom:1px solid #1e1e1e;"><span style="color:#3B82F6;font-size:13px;font-weight:600;">Progress analytics</span><span style="color:rgba(255,255,255,0.35);font-size:12px;"> — track shots, stickhandling, and more</span></td></tr>
                  <tr><td style="padding:7px 0;"><span style="color:#3B82F6;font-size:13px;font-weight:600;">Push notifications</span><span style="color:rgba(255,255,255,0.35);font-size:12px;"> — reminders and updates from your team</span></td></tr>
                </table>
              </div>
              <div style="border-top:1px solid #2a2a2a;padding-top:24px;">
                <p style="color:rgba(255,255,255,0.3);font-size:12px;line-height:1.7;margin:0;text-align:center;">If you weren't expecting this email, contact your team administrator.</p>
              </div>
            </td>
          </tr>
          <tr>
            <td style="padding-top:28px;text-align:center;">
              <p style="color:rgba(255,255,255,0.2);font-size:12px;margin:0;">TRAINR · trainrhockey.com</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}
