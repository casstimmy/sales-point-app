/**
 * Sync parent-child product quantities.
 * 
 * RULE: Child qty is ALWAYS derived from parent: child.qty = parent.qty × qtyPerPack.
 * Child qty is never independently managed — every change flows through the parent.
 *
 * syncParentChildQty(productId, qtySold):
 *   Called AFTER the main save loop has already run `$inc: { quantity: -qtySold }` on the sold product.
 *
 *   If CHILD sold:
 *     1. Undo the direct child decrement (restore child qty)
 *     2. Decrement parent by qtySold / qtyPerPack
 *     3. Set child qty = newParentQty × qtyPerPack
 *
 *   If PARENT sold:
 *     1. Parent qty already decremented by save loop — read updated value
 *     2. Set child qty = newParentQty × qtyPerPack
 *
 * deriveChildQty(parentId):
 *   Recalculates child qty from parent. Use after any direct parent qty change (stock-movement, restock, etc.)
 */

import Product from "@/src/models/Product";

export async function syncParentChildQty(productId, qtySold) {
  try {
    const product = await Product.findById(productId)
      .select("isChildProduct parentProduct packType qtyPerPack quantity")
      .lean();

    if (!product) return;

    if (product.isChildProduct && product.parentProduct) {
      // CHILD (unit) was sold.
      // The save loop already decremented child qty — undo that first.
      await Product.findByIdAndUpdate(productId, {
        $inc: { quantity: qtySold },
      });

      const parent = await Product.findById(product.parentProduct)
        .select("qtyPerPack quantity")
        .lean();

      if (parent && parent.qtyPerPack > 0) {
        const parentDecrement = qtySold / parent.qtyPerPack;
        // Decrement parent
        const updatedParent = await Product.findByIdAndUpdate(
          product.parentProduct,
          { $inc: { quantity: -parentDecrement } },
          { new: true }
        );

        // Derive child qty from the new parent qty
        const newChildQty = updatedParent.quantity * parent.qtyPerPack;
        await Product.findByIdAndUpdate(productId, {
          $set: { quantity: newChildQty },
        });

        console.log(
          `🔗 Child sold ${qtySold} units → parent: ${updatedParent.quantity} packs, child: ${newChildQty} units`
        );
      }
    } else if (product.packType === "pack" && product.qtyPerPack > 0) {
      // PARENT (pack) was sold — save loop already decremented parent qty.
      // product.quantity is the updated value (findByIdAndUpdate with {new:true} in save loop).
      // Just derive child qty.
      const child = await Product.findOne({
        parentProduct: productId,
        isChildProduct: true,
      }).select("_id").lean();

      if (child) {
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

/**
 * Derive child qty from parent after any direct parent qty change.
 * Call this after stock movements, restocks, purchase orders, stock takes, etc.
 * Also works if you pass a child ID — it will find the parent and derive.
 */
export async function deriveChildQty(productId) {
  try {
    const product = await Product.findById(productId)
      .select("isChildProduct parentProduct packType qtyPerPack quantity")
      .lean();

    if (!product) return;

    if (product.isChildProduct && product.parentProduct) {
      // Was given a child — look up parent and derive
      const parent = await Product.findById(product.parentProduct)
        .select("quantity qtyPerPack")
        .lean();
      if (parent && parent.qtyPerPack > 0) {
        const newChildQty = parent.quantity * parent.qtyPerPack;
        await Product.findByIdAndUpdate(productId, {
          $set: { quantity: newChildQty },
        });
      }
    } else if (product.packType === "pack" && product.qtyPerPack > 0) {
      // Was given a parent — find child and derive
      const child = await Product.findOne({
        parentProduct: productId,
        isChildProduct: true,
      }).select("_id").lean();

      if (child) {
        const newChildQty = product.quantity * product.qtyPerPack;
        await Product.findByIdAndUpdate(child._id, {
          $set: { quantity: newChildQty },
        });
      }
    }
  } catch (err) {
    console.warn("⚠️ deriveChildQty error:", err.message);
  }
}
