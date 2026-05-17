module.exports = async function handler(req, res) {
  const { shop, code } = req.query;

  if (!shop || !code) {
    return res.status(400).send("Missing shop or code");
  }

  const response = await fetch(`https://${shop}/admin/oauth/access_token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      client_id: process.env.SHOPIFY_API_KEY,
      client_secret: process.env.SHOPIFY_API_SECRET,
      code,
    }),
  });

  const data = await response.json();

  if (!data.access_token) {
    console.error("Shopify token exchange failed:", data);
    return res.status(500).json(data);
  }

  return res.status(200).send(`
    <h2>Shopify app installed successfully</h2>
    <p>Copy this Admin API access token and paste it into Vercel:</p>
    <textarea style="width:100%;height:120px;">${data.access_token}</textarea>
  `);
};
