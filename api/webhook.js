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
    for await (const chunk of req) chunks.push(chunk);

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
  if (cachedShopifyToken) return cachedShopifyToken;

  const shop = process.env.SHOPIFY_STORE_DOMAIN;
  const clientId = process.env.SHOPIFY_CLIENT_ID;
  const clientSecret = process.env.SHOPIFY_CLIENT_SECRET;

  const response = await fetch(`https://${shop}/admin/oauth/access_token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "client_credentials",
    }),
  });

  const data = await response.json();

  if (!response.ok || !data.access_token) {
    throw new Error(`Failed to get Shopify access token: ${JSON.stringify(data)}`);
  }

  cachedShopifyToken = data.access_token;
  return cachedShopifyToken;
}

async function getStripeLineItems(sessionId) {
  const lineItems = await stripe.checkout.sessions.listLineItems(sessionId, {
    limit: 100,
    expand: ["data.price.product"],
  });

  return lineItems.data.map((item) => {
    const product = item.price?.product;
    const metadata = product?.metadata || {};

    const variantId = metadata.shopify_variant_id;
    const originalPrice = metadata.original_price;
    const finalPrice = metadata.final_price;

    const quantity = item.quantity || 1;
    const lineTotal = ((item.amount_total || item.amount_subtotal || 0) / 100).toFixed(2);
    const unitPrice = (Number(lineTotal) / quantity).toFixed(2);

    const lineItem = {
      quantity,
      price: unitPrice,
      properties: [
        { name: "Stripe Product ID", value: product?.id || "" },
        { name: "Stripe Price ID", value: item.price?.id || "" },
      ],
    };

    if (originalPrice) {
      lineItem.properties.push({
        name: "Original Price",
        value: originalPrice,
      });
    }

    if (finalPrice) {
      lineItem.properties.push({
        name: "Sale Price",
        value: finalPrice,
      });
    }

    if (variantId && !Number.isNaN(Number(variantId))) {
      lineItem.variant_id = Number(variantId);
    } else {
      lineItem.title = product?.name || item.description || "Stripe Checkout Product";
    }

    return lineItem;
  });
}

async function getShippingLine(session) {
  const amountShipping = session.total_details?.amount_shipping || 0;

  let shippingName = "Shipping";

  if (session.shipping_cost?.shipping_rate) {
    try {
      const rate = await stripe.shippingRates.retrieve(session.shipping_cost.shipping_rate);
      shippingName = rate.display_name || shippingName;
    } catch (err) {
      console.error("Failed to retrieve Stripe shipping rate:", err.message);
    }
  }

  return {
    title: shippingName,
    price: (amountShipping / 100).toFixed(2),
    code: shippingName,
    source: "Stripe Checkout",
  };
}

async function createShopifyOrder(session) {
  const shop = process.env.SHOPIFY_STORE_DOMAIN;
  const token = await getShopifyAccessToken();

  const currency = (session.currency || "usd").toUpperCase();
  const orderTotal = ((session.amount_total || 0) / 100).toFixed(2);

  const customerEmail =
    session.customer_details?.email ||
    session.customer_email ||
    "no-email@stripe-checkout.local";

  const fullName = session.customer_details?.name || "";
  const firstName = fullName.split(" ")[0] || "";
  const lastName = fullName.split(" ").slice(1).join(" ") || "";

  const lineItems = await getStripeLineItems(session.id);
  const shippingLine = await getShippingLine(session);

  const orderPayload = {
    order: {
      email: customerEmail,
      currency,
      financial_status: "paid",
      source_name: "Stripe Checkout",
      tags: "Stripe Checkout, External Payment",
      note: `Stripe Checkout Session: ${session.id}`,
      send_receipt: true,

      line_items: lineItems,
      shipping_lines: [shippingLine],

      transactions: [
        {
          kind: "sale",
          status: "success",
          amount: orderTotal,
          gateway: "Stripe",
        },
      ],

      customer: {
        first_name: firstName,
        last_name: lastName,
        email: customerEmail,
      },

      shipping_address: session.customer_details?.address
        ? {
            first_name: firstName,
            last_name: lastName,
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
