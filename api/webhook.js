const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);

let cachedShopifyToken = null;

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).send("Method Not Allowed");
  }

  const sig = req.headers["stripe-signature"];
  let event;

  try {
    const chunks = [];

    for await (const chunk of req) {
      chunks.push(chunk);
    }

    const rawBody = Buffer.concat(chunks);

    event = stripe.webhooks.constructEvent(
      rawBody,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    console.error("Webhook signature verification failed:", err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  try {
    if (event.type === "checkout.session.completed") {
      const session = event.data.object;

      console.log("Checkout completed:", session.id);

      await createShopifyOrder(session);
    }

    return res.status(200).json({ received: true });
  } catch (err) {
    console.error("Webhook handler error:", err);
    return res.status(500).json({ error: "Webhook handler failed" });
  }
};

async function getShopifyAccessToken() {
  if (cachedShopifyToken) {
    return cachedShopifyToken;
  }

  const shop = process.env.SHOPIFY_STORE_DOMAIN;
  const clientId = process.env.SHOPIFY_CLIENT_ID;
  const clientSecret = process.env.SHOPIFY_CLIENT_SECRET;

  if (!shop || !clientId || !clientSecret) {
    throw new Error("Missing Shopify environment variables");
  }

  const response = await fetch(`https://${shop}/admin/oauth/access_token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "client_credentials",
    }),
  });

  const data = await response.json();

  console.log("Shopify token response:", JSON.stringify(data, null, 2));

  if (!response.ok || !data.access_token) {
    throw new Error(`Failed to get Shopify access token: ${JSON.stringify(data)}`);
  }

  cachedShopifyToken = data.access_token;
  return cachedShopifyToken;
}

async function createShopifyOrder(session) {
  const shop = process.env.SHOPIFY_STORE_DOMAIN;
  const token = await getShopifyAccessToken();

  const amount = ((session.amount_total || 0) / 100).toFixed(2);
  const currency = (session.currency || "usd").toUpperCase();

  const customerEmail =
    session.customer_details?.email ||
    session.customer_email ||
    "no-email@stripe-checkout.local";

  const name = session.customer_details?.name || "";

  const orderPayload = {
    order: {
      email: customerEmail,
      currency,
      financial_status: "paid",
      source_name: "Stripe Checkout",
      tags: "Stripe Checkout, External Payment",
      note: `Stripe Checkout Session: ${session.id}`,
      send_receipt: true,
      line_items: [
        {
          title: "Stripe Checkout Order",
          quantity: 1,
          price: amount,
        },
      ],
      transactions: [
        {
          kind: "sale",
          status: "success",
          amount,
          gateway: "Stripe",
        },
      ],
      customer: {
        first_name: name.split(" ")[0] || "",
        last_name: name.split(" ").slice(1).join(" ") || "",
        email: customerEmail,
      },
      shipping_address: session.customer_details?.address
        ? {
            first_name: name.split(" ")[0] || "",
            last_name: name.split(" ").slice(1).join(" ") || "",
            address1: session.customer_details.address.line1 || "",
            address2: session.customer_details.address.line2 || "",
            city: session.customer_details.address.city || "",
            province: session.customer_details.address.state || "",
            country: session.customer_details.address.country || "",
            zip: session.customer_details.address.postal_code || "",
            phone: session.customer_details.phone || "",
          }
        : undefined,
    },
  };

  const response = await fetch(`https://${shop}/admin/api/2026-01/orders.json`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Access-Token": token,
    },
    body: JSON.stringify(orderPayload),
  });

  const data = await response.json();

  console.log("Shopify order response:", JSON.stringify(data, null, 2));

  if (!response.ok || !data.order) {
    throw new Error(`Failed to create Shopify order: ${JSON.stringify(data)}`);
  }

  return data.order;
}
