// Vercel Serverless Function - Create Stripe Checkout Session

const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { priceAmount, successUrl, cancelUrl } = req.body;

  try {
    // Create a Stripe Checkout Session for a recurring subscription
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: 'usd',
            product_data: {
              name: 'Delano Tigers Training Program',
              description: '12-Week Off-Ice Development Program - Monthly Access',
            },
            unit_amount: priceAmount, // Amount in cents ($50.00 = 5000)
            recurring: {
              interval: 'month',
            },
          },
          quantity: 1,
        },
      ],
      mode: 'subscription',
      success_url: successUrl,
      cancel_url: cancelUrl,
      allow_promotion_codes: true, // Allow discount codes
      billing_address_collection: 'required',
    });

    res.status(200).json({ sessionId: session.id });
  } catch (error) {
    console.error('Error creating checkout session:', error);
    res.status(500).json({ error: error.message });
  }
}
