const Stripe = require('stripe');

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', 'https://dinhnova.com');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;

    if (!body || !Array.isArray(body.items) || body.items.length === 0) {
      return res.status(400).json({ error: 'Cart is empty or invalid' });
    }

    const line_items = body.items.map((item) => {
      const unitAmount = Math.round(Number(item.price) * 100);

      if (!item.title || !item.quantity || !Number.isFinite(unitAmount) || unitAmount <= 0) {
        throw new Error('Invalid cart item');
      }

      return {
        price_data: {
          currency: 'usd',
          product_data: {
            name: item.title,
          },
          unit_amount: unitAmount,
        },
        quantity: Number(item.quantity),
      };
    });

    const session = await stripe.checkout.sessions.create({
  mode: 'payment',
  line_items: lineItems,

  phone_number_collection: {
    enabled: true
  },

  shipping_address_collection: {
    allowed_countries: ['US']
  },

  success_url: `${origin}/pages/success?session_id={CHECKOUT_SESSION_ID}`,
  cancel_url: `${origin}/cart`
});

    return res.status(200).json({ url: session.url });
  } catch (error) {
    console.error('Stripe checkout error:', error);
    return res.status(500).json({
      error: error.message || 'Failed to create Stripe Checkout session',
    });
  }
};
