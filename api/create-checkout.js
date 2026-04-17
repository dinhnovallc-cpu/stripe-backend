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

    console.log('Incoming body:', JSON.stringify(body, null, 2));

    if (!body || !Array.isArray(body.items) || body.items.length === 0) {
      return res.status(400).json({ error: 'Cart is empty or invalid' });
    }

    const line_items = body.items.map((item) => {
      const unitAmount = Math.round(Number(item.price) * 100);

      if (!item.title || !unitAmount || !item.quantity) {
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
      payment_method_types: ['card'],
      line_items: line_items,

      shipping_address_collection: {
        allowed_countries: ['US'],
      },

      success_url: 'https://dinhnova.com/pages/thank-you',
      cancel_url: 'https://dinhnova.com/cart',
    });

    console.log('Session created:', session.id);

    return res.status(200).json({
      url: session.url,
    });
  } catch (error) {
    console.error('Stripe error:', error);
    return res.status(500).json({
      error: error.message || 'Failed to create Stripe checkout session',
    });
  }
};
