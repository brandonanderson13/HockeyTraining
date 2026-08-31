const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// Fallback: map monthly/annual price amount (cents) to seat limit
// in case metadata.seat_limit is not set on the Stripe product
const PRICE_TO_SEAT_LIMIT = {
  4900:   20,   // $49/mo   — Select
  49900:  20,   // $499/yr  — Select
  10900:  50,   // $109/mo  — Elite
  109900: 50,   // $1,099/yr — Elite
  29900:  150,  // $299/mo  — Premier
  299900: 150,  // $2,999/yr — Premier
  54900:  300,  // $549/mo  — Premier+
  549900: 300,  // $5,499/yr — Premier+
};

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const sig = req.headers['stripe-signature'];
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  let event;

  try {
    event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
  } catch (err) {
    console.error('Webhook signature verification failed:', err.message);
    return res.status(400).json({ error: 'Webhook signature verification failed' });
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object;

        const customerEmail = session.customer_email || session.customer_details?.email;
        const customerId = session.customer;
        const subscriptionId = session.subscription;
        const metadata = session.metadata || {};

        if (!customerEmail) {
          console.error('No email found in checkout session');
          break;
        }

        // Get or create user in Supabase Auth
        const { data: existingUsers } = await supabase.auth.admin.listUsers();
        let userId = existingUsers?.users?.find(u => u.email === customerEmail)?.id;

        if (!userId) {
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

        // Fetch subscription details from Stripe
        let expiresAt = null;
        let seatLimit = metadata.seat_limit ? parseInt(metadata.seat_limit) : null;

        if (subscriptionId) {
          try {
            const stripeSub = await stripe.subscriptions.retrieve(subscriptionId, {
              expand: ['items.data.price']
            });
            expiresAt = new Date(stripeSub.current_period_end * 1000).toISOString();

            // Fallback seat limit from price amount if not in metadata
            if (!seatLimit) {
              const priceAmount = stripeSub.items?.data?.[0]?.price?.unit_amount;
              seatLimit = PRICE_TO_SEAT_LIMIT[priceAmount] || null;
              if (seatLimit) console.log(`Seat limit resolved from price ${priceAmount}: ${seatLimit}`);
            }
          } catch (e) {
            console.error('Error fetching subscription:', e.message);
          }
        }

        const isAssociation = metadata.subscription_type === 'association';
        const role = isAssociation ? 'admin' : 'player';
        let orgId = isAssociation && metadata.organization_id
          ? metadata.organization_id
          : (!isAssociation ? 'individual' : null);

        // Create org if needed
        if (orgId && orgId !== 'individual') {
          const { data: existingOrg } = await supabase.from('organizations').select('id').eq('id', orgId).single();
          if (!existingOrg) {
            await supabase.from('organizations').insert({
              id: orgId,
              name: metadata.organization_name || orgId,
              primary_color: '#E07820'
            });
          }
        }

        const { error: upsertError } = await supabase
          .from('subscriptions')
          .upsert({
            user_id: userId,
            email: customerEmail,
            first_name: metadata.first_name || null,
            last_name: metadata.last_name || null,
            subscription_type: metadata.subscription_type || 'individual',
            seat_limit: seatLimit,
            organization_name: metadata.organization_name || null,
            organization_id: orgId,
            stripe_customer_id: customerId,
            stripe_subscription_id: subscriptionId,
            status: 'active',
            role: role,
            expires_at: expiresAt
          }, { onConflict: 'user_id' });

        if (upsertError) {
          console.error('Error upserting subscription:', upsertError);
        } else {
          console.log('✓ Subscription activated for:', customerEmail, '| seats:', seatLimit, '| expires:', expiresAt);
        }

        // Update org-level record for associations
        if (isAssociation && orgId && orgId !== 'individual') {
          await supabase.from('organizations').update({
            expires_at: expiresAt,
            status: 'active',
            seat_limit: seatLimit,
            stripe_subscription_id: subscriptionId,
            stripe_customer_id: customerId
          }).eq('id', orgId);
          console.log('✓ Organization updated:', orgId, '| seats:', seatLimit);
        }
        break;
      }

      case 'invoice.payment_succeeded': {
        const invoice = event.data.object;
        const subscriptionId = invoice.subscription;
        if (!subscriptionId) break;

        try {
          const stripeSub = await stripe.subscriptions.retrieve(subscriptionId, {
            expand: ['items.data.price']
          });
          const expiresAt = new Date(stripeSub.current_period_end * 1000).toISOString();

          // Re-derive seat limit in case of plan change
          const priceAmount = stripeSub.items?.data?.[0]?.price?.unit_amount;
          const seatLimit = PRICE_TO_SEAT_LIMIT[priceAmount] || null;

          await supabase.from('subscriptions')
            .update({ status: 'active', expires_at: expiresAt, ...(seatLimit && { seat_limit: seatLimit }) })
            .eq('stripe_subscription_id', subscriptionId);

          await supabase.from('organizations')
            .update({ expires_at: expiresAt, status: 'active', ...(seatLimit && { seat_limit: seatLimit }) })
            .eq('stripe_subscription_id', subscriptionId);

          console.log('✓ Renewal processed | expires:', expiresAt, '| seats:', seatLimit);
        } catch (e) {
          console.error('Error processing renewal:', e.message);
        }
        break;
      }

      case 'customer.subscription.updated': {
        const subscription = event.data.object;
        const expiresAt = new Date(subscription.current_period_end * 1000).toISOString();
        const status = subscription.status === 'active' ? 'active' : subscription.status;

        // Re-derive seat limit on plan upgrade/downgrade
        const stripeSub = await stripe.subscriptions.retrieve(subscription.id, {
          expand: ['items.data.price']
        });
        const priceAmount = stripeSub.items?.data?.[0]?.price?.unit_amount;
        const seatLimit = PRICE_TO_SEAT_LIMIT[priceAmount] || null;

        await supabase.from('subscriptions')
          .update({ status, expires_at: expiresAt, ...(seatLimit && { seat_limit: seatLimit }) })
          .eq('stripe_subscription_id', subscription.id);

        await supabase.from('organizations')
          .update({ status, expires_at: expiresAt, ...(seatLimit && { seat_limit: seatLimit }) })
          .eq('stripe_subscription_id', subscription.id);

        console.log('✓ Subscription updated:', subscription.id, '| status:', status, '| seats:', seatLimit);
        break;
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object;

        await supabase.from('subscriptions')
          .update({ status: 'cancelled' })
          .eq('stripe_subscription_id', subscription.id);

        await supabase.from('organizations')
          .update({ status: 'cancelled' })
          .eq('stripe_subscription_id', subscription.id);

        console.log('✓ Subscription cancelled:', subscription.id);
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
