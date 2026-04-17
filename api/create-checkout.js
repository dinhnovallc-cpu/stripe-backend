import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

export default async function handler(req, res) {
  // CORS
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
    // Body có thể đã là object, hoặc vẫn là string
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;

    console.log('Received body:', JSON.stringify(body, null, 2));

    if (!body || !body.items || !Array.isArray(body.items) || body.items.length === 0) {
      return res.status(400).json({ error: 'Cart is empty or invalid' });
    }

    const line_items = body.items.map((item) => {
      const unitAmount = Math.round(Number(item.price) * 100);

      if (!item.title || !unitAmount || !item.quantity) {
        throw new Error('Invalid cart item data');
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
        quantity: item.quantity,
      };
    });

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],

      line_items,

      // Hiện địa chỉ giao hàng
      shipping_address_collection: {
        allowed_countries: ['US'],
      },

      // Hiện 1 lựa chọn shipping cơ bản
      shipping_options: [
        {
          shipping_rate_data: {
            type: 'fixed_amount',
            fixed_amount: {
              amount: 0,
              currency: 'usd',
            },
            display_name: 'Standard Shipping',
            delivery_estimate: {
              minimum: { unit: 'business_day', value: 5 },
              maximum: { unit: 'business_day', value: 10 },
            },
          },
        },
      ],

      phone_number_collection: {
        enabled: true,
      },

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
}
