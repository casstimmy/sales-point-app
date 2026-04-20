/**
 * Sync parent-child product quantities after a sale.
 * 
 * When a PACK (parent) product is sold, decrement the child (unit) qty by sold * qtyPerPack.
 * When a UNIT (child) product is sold, decrement the parent (pack) qty by sold / qtyPerPack.
 */

import Product from "@/src/models/Product";

export async function syncParentChildQty(productId, qtySold) {
  try {
    const product = await Product.findById(productId)
      .select("isChildProduct parentProduct packType qtyPerPack quantity")
      .lean();

    if (!product) return;

    if (product.isChildProduct && product.parentProduct) {
      // Child (unit) was sold → decrement parent (pack) qty
      const parent = await Product.findById(product.parentProduct)
        .select("qtyPerPack quantity")
        .lean();
      if (parent && parent.qtyPerPack > 0) {
        const parentDecrement = qtySold / parent.qtyPerPack;
        await Product.findByIdAndUpdate(product.parentProduct, {
          $inc: { quantity: -parentDecrement },
        });
        console.log(
          `🔗 Child sold ${qtySold} units → parent decremented by ${parentDecrement} packs`
        );
      }
    } else if (product.packType === "pack" && product.qtyPerPack > 1) {
      // Parent (pack) was sold → decrement child (unit) qty
      const child = await Product.findOne({
        parentProduct: productId,
        isChildProduct: true,
      }).select("_id quantity").lean();

      if (child) {
        const childDecrement = qtySold * product.qtyPerPack;
        await Product.findByIdAndUpdate(child._id, {
          $inc: { quantity: -childDecrement },
        });
        console.log(
          `🔗 Pack sold ${qtySold} packs → child decremented by ${childDecrement} units`
        );
      }
    }
  } catch (err) {
    console.warn("⚠️ Parent-child qty sync error:", err.message);
  }
}
