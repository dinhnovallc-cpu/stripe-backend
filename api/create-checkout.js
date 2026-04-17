export default function handler(req, res) {
  if (req.method === 'POST') {
    const { cart } = req.body;

    console.log('Received cart:', cart);

    return res.status(200).json({
      success: true,
      message: 'Cart received successfully',
      cart_item_count: cart.item_count
    });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
