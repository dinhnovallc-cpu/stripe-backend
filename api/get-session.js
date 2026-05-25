import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  const { session_id } = req.query;

  if (!session_id) {
    return res.status(400).json({
      error: "Missing session_id",
    });
  }

  try {
    const session = await stripe.checkout.sessions.retrieve(
      session_id,
      {
        expand: ["line_items"],
      }
    );

    return res.status(200).json({
      id: session.id,
      amount_total: session.amount_total,
      currency: session.currency,
      payment_status: session.payment_status,
      customer_email: session.customer_details?.email,
      line_items: session.line_items,
    });
  } catch (err) {
    return res.status(500).json({
      error: err.message,
    });
  }
}
