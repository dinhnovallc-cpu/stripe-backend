const crypto = require("crypto");

module.exports = async function handler(req, res) {
  const { shop } = req.query;

  if (!shop) {
    return res.status(400).send("Missing shop parameter");
  }

  const apiKey = process.env.SHOPIFY_API_KEY;

  const scopes = "read_orders,write_orders";
  const redirectUri = "https://stripe-backend-mu-ashen.vercel.app/api/callback";

  const installUrl =
    `https://${shop}/admin/oauth/authorize` +
    `?client_id=${apiKey}` +
    `&scope=${scopes}` +
    `&redirect_uri=${encodeURIComponent(redirectUri)}`;

  return res.redirect(installUrl);
};
