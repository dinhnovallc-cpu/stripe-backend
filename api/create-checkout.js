import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { items, origin } = req.body;

    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'No items provided' });
    }

    if (!origin) {
      return res.status(400).json({ error: 'Missing origin' });
    }

    const lineItems = items.map((item) => ({
      price_data: {
        currency: 'usd',
        product_data: {
          name: item.title || 'Product',
        },
        unit_amount: Math.round(Number(item.price) * 100),
      },
      quantity: item.quantity || 1,
    }));

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: lineItems,

      billing_address_collection: 'required',

      phone_number_collection: {
        enabled: true,
      },

      shipping_address_collection: {
        allowed_countries: ['US'],
      },

      success_url: `${origin}/pages/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/cart`,
    });

    return res.status(200).json({ url: session.url });
  } catch (error) {
    console.error('Stripe session error:', error);
    return res.status(500).json({
      error: 'Failed to create Stripe Checkout session',
      details: error.message,
    });
  }
}
