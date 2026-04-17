import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { items } = req.body;

    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: "Cart is empty or invalid" });
    }

  const line_items = items.map((item) => ({
  price_data: {
    currency: "usd",
    product_data: {
      name: item.title || "Product"
    },
    unit_amount: Math.round(Number(item.price) * 100),
  },
  quantity: item.quantity || 1,
}));

    const session = await stripe.checkout.sessions.create({
  payment_method_types: ['card'],
  mode: 'payment',
  line_items: lineItems,

  shipping_address_collection: {
    allowed_countries: ['US'],
  },

  success_url: 'https://dinhnova.com/pages/thank-you',
  cancel_url: 'https://dinhnova.com/cart',
});

    return res.status(200).json({ url: session.url });
  } catch (error) {
    console.error("Stripe error:", error);
    return res.status(500).json({
      error: error.message || "Internal server error",
    });
  }
}
