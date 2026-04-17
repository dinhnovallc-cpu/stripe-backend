export default function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Trả lời preflight request của trình duyệt
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method === 'POST') {
    const { cart } = req.body || {};

    console.log('Received cart:', cart);

    return res.status(200).json({
      success: true,
      message: 'Cart received successfully',
      cart_item_count: cart?.item_count ?? 0
    });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
