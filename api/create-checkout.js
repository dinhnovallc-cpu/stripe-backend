const Stripe = require('stripe');

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

module.exports = async function handler(req, res) {
  // CORS for Shopify storefront -> Vercel API
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

      if (!item.title || !item.quantity || !Number.isFinite(unitAmount) || unitAmount <= 0) {
        throw new Error('Invalid cart item');
      }

      return {
        price_data: {
          currency: 'usd',
          product_data: {
            name: item.title,
            images: item.image ? [item.image] : [],
          },
          unit_amount: unitAmount,
        },
        quantity: Number(item.quantity),
      };
    });

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],

      line_items,

      // Collect shipping address
      shipping_address_collection: {
        allowed_countries: ['US'],
      },

      // Collect customer phone number
      phone_number_collection: {
        enabled: true,
      },

      // Show shipping methods
      shipping_options: [
        {
          shipping_rate_data: {
            type: 'fixed_amount',
            fixed_amount: {
              amount: 0,
              currency: 'usd',
            },
            display_name: 'Standard Shipping (5–10 business days)',
            delivery_estimate: {
              minimum: {
                unit: 'business_day',
                value: 5,
              },
              maximum: {
                unit: 'business_day',
                value: 10,
              },
            },
          },
        },
        {
          shipping_rate_data: {
            type: 'fixed_amount',
            fixed_amount: {
              amount: 999,
              currency: 'usd',
            },
            display_name: 'Express Shipping (2–4 business days)',
            delivery_estimate: {
              minimum: {
                unit: 'business_day',
                value: 2,
              },
              maximum: {
                unit: 'business_day',
                value: 4,
              },
            },
          },
        },
      ],

      // Stripe promotion codes only
      allow_promotion_codes: true,

      success_url: 'https://dinhnova.com/pages/thank-you',
      cancel_url: 'https://dinhnova.com/cart',
    });

    console.log('Stripe session created:', session.id);

    return res.status(200).json({
      url: session.url,
    });
  } catch (error) {
    console.error('Stripe checkout error:', error);
    return res.status(500).json({
      error: error.message || 'Failed to create Stripe Checkout session',
    });
  }
};
