/**
 * API: Update Product Quantity After Transaction
 * 
 * Decrements product quantities based on transaction items
 * Called after transaction is saved to reduce inventory
 */

import { mongooseConnect } from '../../../lib/mongoose';
import { default as Product } from '../../../models/Product';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { items } = req.body;

    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'Items array required' });
    }

    await mongooseConnect();

    // Update each product's quantity
    const updates = [];
    
    for (const item of items) {
      if (!item.productId || !item.qty) continue;

      const update = await Product.findByIdAndUpdate(
        item.productId,
        { $inc: { quantity: -item.qty } }, // Decrement by quantity sold
        { new: true }
      );

      if (update) {
        updates.push({
          productId: item.productId,
          productName: item.name,
          quantitySold: item.qty,
          newQuantity: update.quantity,
        });
        console.log(`📦 Updated ${item.name}: sold ${item.qty}, remaining ${update.quantity}`);
      } else {
        console.warn(`⚠️ Product not found: ${item.productId}`);
      }
    }

    return res.status(200).json({
      success: true,
      message: `Updated ${updates.length} products`,
      updates: updates,
    });
  } catch (error) {
    console.error('❌ Error updating product quantities:', error);
    return res.status(500).json({
      error: 'Failed to update product quantities',
      message: error.message,
    });
  }
}
