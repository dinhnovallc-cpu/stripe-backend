update
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);

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

async function createShopifyOrder(session) {
  const shop = process.env.SHOPIFY_STORE_DOMAIN;
  const token = process.env.SHOPIFY_ADMIN_API_ACCESS_TOKEN;

  const mutation = `
    mutation orderCreate($order: OrderCreateOrderInput!) {
      orderCreate(order: $order) {
        order {
          id
          name
        }
        userErrors {
          field
          message
        }
      }
    }
  `;

  const variables = {
    order: {
      email: session.customer_details?.email || session.customer_email,
      currency: session.currency?.toUpperCase() || "USD",
      financialStatus: "PAID",
      sourceName: "Stripe Checkout",
      tags: ["Stripe Checkout", "External Payment"],
      note: `Stripe Checkout Session: ${session.id}`,
      lineItems: [
        {
          title: "Stripe Checkout Order",
          quantity: 1,
          priceSet: {
            shopMoney: {
              amount: (session.amount_total / 100).toFixed(2),
              currencyCode: session.currency?.toUpperCase() || "USD",
            },
          },
        },
      ],
      transactions: [
        {
          kind: "SALE",
          status: "SUCCESS",
          amountSet: {
            shopMoney: {
              amount: (session.amount_total / 100).toFixed(2),
              currencyCode: session.currency?.toUpperCase() || "USD",
            },
          },
          gateway: "Stripe",
        },
      ],
    },
  };

  const response = await fetch(
    `https://${shop}/admin/api/2026-01/graphql.json`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Access-Token": token,
      },
      body: JSON.stringify({
        query: mutation,
        variables,
      }),
    }
  );

  const data = await response.json();

  console.log("Shopify response:", JSON.stringify(data, null, 2));

  if (data.errors || data.data?.orderCreate?.userErrors?.length) {
    throw new Error(JSON.stringify(data));
  }

  return data.data.orderCreate.order;
}
