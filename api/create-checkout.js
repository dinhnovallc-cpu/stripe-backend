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
    const { items, origin } = req.body;

    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: "No items provided" });
    }

    if (!origin) {
      return res.status(400).json({ error: "Missing origin" });
    }

    const getValidImageUrl = (image) => {
  if (!image) return null;

  let url = String(image);

  if (url.startsWith("//")) {
    url = "https:" + url;
  }

  if (!url.startsWith("https://")) {
    return null;
  }

  return url;
};
    const lineItems = items.map((item) => {
  const imageUrl = getValidImageUrl(item.image);

  return {
    price_data: {
      currency: "usd",
      product_data: {
        name: item.title || "Product",

        ...(imageUrl ? { images: [imageUrl] } : {}),

        metadata: {
          shopify_variant_id: String(
            item.variant_id || item.variantId || item.id || ""
          ),
          shopify_product_id: String(
            item.product_id || item.productId || ""
          ),
          original_price: String(
            item.original_price || item.compare_at_price || ""
          ),
          final_price: String(item.price || ""),
        },
      },

      unit_amount: Math.round(Number(item.price) * 100),
    },

    quantity: item.quantity || 1,
  };
});

    const cartTotal = lineItems.reduce((sum, item) => {
      return sum + item.price_data.unit_amount * item.quantity;
    }, 0);

    let shippingOptions = [];

if (cartTotal <= 4800) {
  shippingOptions.push({
    shipping_rate_data: {
      type: "fixed_amount",
      fixed_amount: {
        amount: 590,
        currency: "usd",
      },
      display_name: "Standard Shipping",
      delivery_estimate: {
        minimum: { unit: "business_day", value: 3 },
        maximum: { unit: "business_day", value: 12 },
      },
    },
  });
}

if (cartTotal >= 4900 && cartTotal <= 30000) {
  shippingOptions.push({
    shipping_rate_data: {
      type: "fixed_amount",
      fixed_amount: {
        amount: 0,
        currency: "usd",
      },
      display_name: "Standard Free Shipping",
      delivery_estimate: {
        minimum: { unit: "business_day", value: 3 },
        maximum: { unit: "business_day", value: 6 },
      },
    },
  });
}

if (cartTotal >= 0 && cartTotal <= 30000) {
  shippingOptions.push({
    shipping_rate_data: {
      type: "fixed_amount",
      fixed_amount: {
        amount: 1990,
        currency: "usd",
      },
      display_name: "Expedited Shipping",
      delivery_estimate: {
        minimum: { unit: "business_day", value: 2 },
        maximum: { unit: "business_day", value: 3 },
      },
    },
  });
}

if (cartTotal >= 30100) {
  shippingOptions.push({
    shipping_rate_data: {
      type: "fixed_amount",
      fixed_amount: {
        amount: 690,
        currency: "usd",
      },
      display_name: "Large Order Shipping",
      delivery_estimate: {
        minimum: { unit: "business_day", value: 3 },
        maximum: { unit: "business_day", value: 7 },
      },
    },
  });
}

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items: lineItems,

      locale: "en",

      billing_address_collection: "required",

      phone_number_collection: {
        enabled: true,
      },

      shipping_address_collection: {
        allowed_countries: ["US", "SE", "DE", "GB", "FR"],
      },

      shipping_options: shippingOptions,

      success_url:
        "https://dinhnova.com/pages/thank-you?session_id={CHECKOUT_SESSION_ID}",
      cancel_url: "https://dinhnova.com/cart",
    });

    return res.status(200).json({ url: session.url });
  } catch (error) {
    console.error("Stripe session error:", error);
    return res.status(500).json({
      error: "Failed to create Stripe Checkout session",
      details: error.message,
    });
  }
}
