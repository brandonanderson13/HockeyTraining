// Vercel Serverless Function - Stripe Webhook Handler
// Handles checkout.session.completed and customer.subscription.deleted events

const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY // Use service key for admin operations
);

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const sig = req.headers['stripe-signature'];
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  let event;

  try {
    // Verify webhook signature
    event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
  } catch (err) {
    console.error('Webhook signature verification failed:', err.message);
    return res.status(400).json({ error: 'Webhook signature verification failed' });
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object;
        
        // Extract customer info
        const customerEmail = session.customer_email || session.customer_details?.email;
        const customerId = session.customer;
        const subscriptionId = session.subscription;
        
        if (!customerEmail) {
          console.error('No email found in checkout session');
          break;
        }

        // Get or create user in Supabase Auth
        const { data: existingUsers } = await supabase.auth.admin.listUsers();
        let userId = existingUsers?.users?.find(u => u.email === customerEmail)?.id;
        
        if (!userId) {
          // Create new auth user
          const { data: newUser, error: createError } = await supabase.auth.admin.createUser({
            email: customerEmail,
            email_confirm: true
          });
          
          if (createError) {
            console.error('Error creating user:', createError);
            break;
          }
          userId = newUser.user.id;
        }

        // Create or update subscription record
        const { error: upsertError } = await supabase
          .from('subscriptions')
          .upsert({
            user_id: userId,
            email: customerEmail,
            stripe_customer_id: customerId,
            stripe_subscription_id: subscriptionId,
            status: 'active',
            expires_at: null // null = active recurring subscription
          }, {
            onConflict: 'user_id'
          });

        if (upsertError) {
          console.error('Error upserting subscription:', upsertError);
        } else {
          console.log('✓ Subscription activated for:', customerEmail);
        }
        break;
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object;
        const subscriptionId = subscription.id;

        // Mark subscription as cancelled in database
        const { error: updateError } = await supabase
          .from('subscriptions')
          .update({ status: 'cancelled' })
          .eq('stripe_subscription_id', subscriptionId);

        if (updateError) {
          console.error('Error cancelling subscription:', updateError);
        } else {
          console.log('✓ Subscription cancelled:', subscriptionId);
        }
        break;
      }

      default:
        console.log('Unhandled event type:', event.type);
    }

    res.status(200).json({ received: true });
  } catch (err) {
    console.error('Error processing webhook:', err);
    res.status(500).json({ error: 'Webhook processing failed' });
  }
}
