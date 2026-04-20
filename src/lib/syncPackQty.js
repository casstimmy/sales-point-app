/**
 * Sync parent-child product quantities after a sale.
 * 
 * Child (unit) qty is always derived from parent: child.qty = parent.qty * qtyPerPack.
 * The main save/sync loop already decrements the sold product's own qty,
 * so this function corrects that by deriving the child qty from the parent.
 *
 * When a UNIT (child) is sold:
 *   - Decrement parent (pack) qty by qtySold / qtyPerPack
 *   - Set child qty = newParentQty * qtyPerPack (overwrites the direct decrement)
 *
 * When a PACK (parent) is sold:
 *   - Parent qty already decremented by the main loop
 *   - Set child qty = newParentQty * qtyPerPack
 */

import Product from "@/src/models/Product";

export async function syncParentChildQty(productId, qtySold) {
  try {
    const product = await Product.findById(productId)
      .select("isChildProduct parentProduct packType qtyPerPack quantity")
      .lean();

    if (!product) return;

    if (product.isChildProduct && product.parentProduct) {
      // Child (unit) was sold
      // The main loop already decremented child qty — we need to deduct from parent instead
      const parent = await Product.findById(product.parentProduct)
        .select("qtyPerPack quantity")
        .lean();

      if (parent && parent.qtyPerPack > 0) {
        const parentDecrement = qtySold / parent.qtyPerPack;
        const newParentQty = parent.quantity - parentDecrement;
        const newChildQty = newParentQty * parent.qtyPerPack;

        // Decrement parent by packs equivalent
        await Product.findByIdAndUpdate(product.parentProduct, {
          $set: { quantity: newParentQty },
        });

        // Derive child qty from parent (overwrites the direct decrement from save loop)
        await Product.findByIdAndUpdate(productId, {
          $set: { quantity: newChildQty },
        });

        console.log(
          `🔗 Child sold ${qtySold} units → parent: ${newParentQty} packs, child: ${newChildQty} units`
        );
      }
    } else if (product.packType === "pack" && product.qtyPerPack > 1) {
      // Parent (pack) was sold — main loop already decremented parent qty
      // Derive child qty from updated parent
      const child = await Product.findOne({
        parentProduct: productId,
        isChildProduct: true,
      }).select("_id").lean();

      if (child) {
        // product.quantity is already the NEW (post-decrement) value
        const newChildQty = product.quantity * product.qtyPerPack;
        await Product.findByIdAndUpdate(child._id, {
          $set: { quantity: newChildQty },
        });

        console.log(
          `🔗 Pack sold ${qtySold} → parent: ${product.quantity} packs, child: ${newChildQty} units`
        );
      }
    }
  } catch (err) {
    console.warn("⚠️ Parent-child qty sync error:", err.message);
  }
}
