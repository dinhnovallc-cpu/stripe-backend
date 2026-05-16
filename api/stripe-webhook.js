import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

export const config = {
  api: {
    bodyParser: false,
  },
};

async function buffer(readable) {
  const chunks = [];

  for await (const chunk of readable) {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
  }

  return Buffer.concat(chunks);
}

async function getShopifyAccessToken() {
  const response = await fetch(
    `https://${process.env.SHOPIFY_STORE_DOMAIN}/admin/oauth/access_token`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        client_id: process.env.SHOPIFY_CLIENT_ID,
        client_secret: process.env.SHOPIFY_CLIENT_SECRET,
      }),
    }
  );

  const data = await response.json();

  return data.access_token;
}

async function createShopifyOrder(session, accessToken) {
  const lineItems = JSON.parse(
    session.metadata?.shopify_line_items || "[]"
  );

  const response = await fetch(
    `https://${process.env.SHOPIFY_STORE_DOMAIN}/admin/api/${process.env.SHOPIFY_API_VERSION}/orders.json`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Access-Token": accessToken,
      },
      body: JSON.stringify({
        order: {
          email: session.customer_details?.email,

          financial_status: "paid",

          send_receipt: true,

          tags: "Stripe Custom Checkout",

          line_items: lineItems.map((item) => ({
            variant_id: item.variant_id,
            quantity: item.quantity,
          })),

          shipping_address: {
            first_name:
              session.customer_details?.name?.split(" ")[0] || "",
            last_name:
              session.customer_details?.name
                ?.split(" ")
                .slice(1)
                .join(" ") || "",

            address1: session.customer_details?.address?.line1 || "",

            city: session.customer_details?.address?.city || "",

            province:
              session.customer_details?.address?.state || "",

            zip:
              session.customer_details?.address?.postal_code || "",

            country:
              session.customer_details?.address?.country || "",

            phone: session.customer_details?.phone || "",
          },

          transactions: [
            {
              kind: "sale",
              status: "success",
              amount: (session.amount_total / 100).toFixed(2),
              gateway: "Stripe Custom Checkout",
            },
          ],
        },
      }),
    }
  );

  const data = await response.json();

  console.log("Shopify Order Response:", data);

  return data;
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).send("Method Not Allowed");
  }

  const sig = req.headers["stripe-signature"];

  const rawBody = await buffer(req);

  let event;

  try {
    event = stripe.webhooks.constructEvent(
      rawBody,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    console.error("Webhook Error:", err.message);

    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  try {
    if (event.type === "checkout.session.completed") {
      const session = event.data.object;

      if (session.payment_status === "paid") {
        const accessToken = await getShopifyAccessToken();

        await createShopifyOrder(session, accessToken);
      }
    }

    return res.status(200).json({
      received: true,
    });
  } catch (err) {
    console.error(err);

    return res.status(500).json({
      error: err.message,
    });
  }
}
