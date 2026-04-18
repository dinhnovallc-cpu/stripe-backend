import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

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
      name: item.title || 'Product'
    },
    unit_amount: Math.round(Number(item.price) * 100)
  },
  quantity: item.quantity || 1
}));

const cartTotal = lineItems.reduce((sum, item) => {
  return sum + (item.price_data.unit_amount * item.quantity);
}, 0);

let shippingOptions;

if (cartTotal >= 4900) {
  shippingOptions = [
    {
      shipping_rate_data: {
        type: 'fixed_amount',
        fixed_amount: {
          amount: 0,
          currency: 'usd'
        },
        display_name: 'Free Shipping',
        delivery_estimate: {
          minimum: {
            unit: 'business_day',
            value: 5
          },
          maximum: {
            unit: 'business_day',
            value: 7
          }
        }
      }
    },
    {
      shipping_rate_data: {
        type: 'fixed_amount',
        fixed_amount: {
          amount: 999,
          currency: 'usd'
        },
        display_name: 'Express Shipping',
        delivery_estimate: {
          minimum: {
            unit: 'business_day',
            value: 2
          },
          maximum: {
            unit: 'business_day',
            value: 3
          }
        }
      }
    }
  ];
} else {
  shippingOptions = [
    {
      shipping_rate_data: {
        type: 'fixed_amount',
        fixed_amount: {
          amount: 499,
          currency: 'usd'
        },
        display_name: 'Standard Shipping',
        delivery_estimate: {
          minimum: {
            unit: 'business_day',
            value: 5
          },
          maximum: {
            unit: 'business_day',
            value: 7
          }
        }
      }
    },
    {
      shipping_rate_data: {
        type: 'fixed_amount',
        fixed_amount: {
          amount: 999,
          currency: 'usd'
        },
        display_name: 'Express Shipping',
        delivery_estimate: {
          minimum: {
            unit: 'business_day',
            value: 2
          },
          maximum: {
            unit: 'business_day',
            value: 3
          }
        }
      }
    }
  ];
}

const session = await stripe.checkout.sessions.create({
  mode: 'payment',
  line_items: lineItems,

  locale: 'en',
  
  billing_address_collection: 'required',

  phone_number_collection: {
    enabled: true
  },

  shipping_address_collection: {
  allowed_countries: ['US', 'SE', 'DE', 'GB', 'FR']
},

  shipping_options: shippingOptions,

  success_url: `https://dinhnova.com/pages/thank-you?session_id={CHECKOUT_SESSION_ID}`,
  cancel_url: `https://dinhnova.com/cart`
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
