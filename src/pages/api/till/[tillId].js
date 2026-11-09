// pages/api/till/[tillId].js
import { mongooseConnect } from "@/src/lib/mongoose";
import Till from "@/src/models/Till";
import { buildExpectedByTender, recalculateTillTotals } from "@/src/lib/tillLedger";

const toPlainMap = (value) => {
  if (!value) return {};
  const source = value instanceof Map ? Object.fromEntries(value) : value;
  return Object.fromEntries(
    Object.entries(source).filter(([key]) => !key.startsWith("$") && !key.startsWith("_"))
  );
};

/**
 * GET /api/till/[tillId]
 * Returns the till with totals rebuilt from its completed sales, so the till
 * screen and the close screen always show the same figures as the reports.
 */
export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ message: "Method not allowed" });
  }

  try {
    await mongooseConnect();

    const { tillId } = req.query;
    if (!tillId) {
      return res.status(400).json({ message: "Till ID is required" });
    }

    const totals = await recalculateTillTotals(tillId);
    if (!totals) {
      return res.status(404).json({ message: "Till not found" });
    }

    const till = await Till.findById(tillId).lean();
    if (!till) {
      return res.status(404).json({ message: "Till not found" });
    }

    const tenderBreakdown = toPlainMap(totals.tenderBreakdown);

    return res.status(200).json({
      message: "Till found",
      till: {
        ...till,
        tenderBreakdown,
        tenderVariances: toPlainMap(till.tenderVariances),
        expectedByTender: buildExpectedByTender(tenderBreakdown, till.openingBalance),
        totalSales: totals.totalSales,
        transactionCount: totals.transactionCount,
      },
    });
  } catch (error) {
    console.error("Error fetching till:", error);
    return res.status(500).json({
      message: "Failed to fetch till",
      error: error.message,
    });
  }
}
