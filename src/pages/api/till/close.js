// pages/api/till/close.js
import { mongooseConnect } from "@/src/lib/mongoose";
import Till from "@/src/models/Till";
import EndOfDayReport from "@/src/models/EndOfDayReport";
import Tender from "@/src/models/Tender";
import Store from "@/src/models/Store";
import { sanitizeBody } from '@/src/lib/apiValidation';
import { buildExpectedByTender, recalculateTillTotals, roundMoney } from '@/src/lib/tillLedger';

/**
 * Bulletproof Mongoose Map → plain object extraction.
 * Tries toJSON(), forEach(), then Object.entries() as fallbacks.
 */
function extractMapToObject(mapField, toObjectFallback) {
  const result = {};
  if (!mapField) return result;

  // Strategy 1: toJSON (most reliable for Mongoose Maps)
  if (typeof mapField.toJSON === 'function') {
    try {
      const json = mapField.toJSON();
      if (json && typeof json === 'object' && !Array.isArray(json)) {
        Object.assign(result, json);
        if (Object.keys(result).length > 0) return result;
      }
    } catch (e) { /* continue */ }
  }

  // Strategy 2: forEach (works on native Map and Mongoose Map)
  if (typeof mapField.forEach === 'function') {
    try {
      mapField.forEach((value, key) => { result[key] = value; });
      if (Object.keys(result).length > 0) return result;
    } catch (e) { /* continue */ }
  }

  // Strategy 3: use the toObject() version (already converted by Mongoose)
  if (toObjectFallback && typeof toObjectFallback === 'object') {
    Object.entries(toObjectFallback).forEach(([key, value]) => {
      if (!key.startsWith('$') && !key.startsWith('_')) {
        result[key] = value;
      }
    });
    if (Object.keys(result).length > 0) return result;
  }

  // Strategy 4: direct Object.entries on the field itself
  if (typeof mapField === 'object' && !Array.isArray(mapField)) {
    try {
      Object.entries(mapField).forEach(([key, value]) => {
        if (!key.startsWith('$') && !key.startsWith('_')) {
          result[key] = value;
        }
      });
    } catch (e) { /* continue */ }
  }

  return result;
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ message: "Method not allowed" });
  }

  req.body = sanitizeBody(req.body);

  try {
    await mongooseConnect();

    const { tillId, tenderCounts, closingNotes } = req.body;
    const safeTenderCounts = tenderCounts && typeof tenderCounts === "object" ? tenderCounts : {};

    console.log("================================================================================");
    console.log("📋 TILL CLOSE REQUEST");
    console.log("================================================================================");
    console.log("Till ID:", tillId);
    console.log("Till ID type:", typeof tillId);
    console.log("Tender counts keys:", Object.keys(safeTenderCounts));

    if (!tillId) {
      console.error("❌ No till ID provided");
      return res.status(400).json({ message: "Till ID is required" });
    }

    // Till lookup - use findById which handles ObjectId automatically
    console.log("🔍 Looking up till:", tillId);
    const till = await Till.findById(tillId).exec();
    
    if (!till) {
      console.error("❌ Till not found by ID:", tillId);
      return res.status(404).json({ 
        message: "Till not found",
        searchedId: tillId
      });
    }

    console.log("✅ Till found:", till._id.toString(), "- Staff:", till.staffName);

    if (till.status !== "OPEN") {
      console.warn("⚠️ Till already closed, status:", till.status);

      // Avoid duplicate EndOfDay reports if already closed
      const existingReport = await EndOfDayReport.findOne({ tillId: till._id });

      const tillResponse = till.toObject();
      tillResponse.tenderBreakdown = extractMapToObject(till.tenderBreakdown, tillResponse.tenderBreakdown);
      tillResponse.tenderVariances = extractMapToObject(till.tenderVariances, tillResponse.tenderVariances);

      return res.status(200).json({
        message: "Till already closed",
        till: tillResponse,
        reportId: existingReport?._id || null,
      });
    }

    // Rebuild the till's numbers from its completed sales (refunds, held and
    // credit sales excluded; change already taken off cash) so the close screen,
    // the stored till and the end-of-day report all use the same figures.
    const ledgerTotals = await recalculateTillTotals(till._id);
    const totalSales = roundMoney(ledgerTotals?.totalSales || 0);
    const transactionCount = ledgerTotals?.transactionCount || 0;
    const tenderBreakdown = { ...(ledgerTotals?.tenderBreakdown || {}) };
    const tenderVariances = {};

    // Get tender mapping (ID to name)
    const tenderDocs = await Tender.find();
    const tenderMap = {};
    tenderDocs.forEach((t) => {
      tenderMap[t._id.toString()] = t.name;
    });

    const countedTenderNames = Object.keys(safeTenderCounts).map((tenderId) => tenderMap[tenderId]).filter(Boolean);
    const expectedByTender = buildExpectedByTender(tenderBreakdown, till.openingBalance, countedTenderNames);

    let totalCountedAmount = 0;

    // Process tender counts (keyed by tender ID). Cash is expected to include the opening float.
    for (const [tenderId, countedAmount] of Object.entries(safeTenderCounts)) {
      const tenderName = tenderMap[tenderId];
      if (!tenderName) {
        console.warn(`Unknown tender ID at till close: ${tenderId}`);
        continue;
      }

      const counted = roundMoney(parseFloat(countedAmount) || 0);
      const expectedAmount = roundMoney(expectedByTender[tenderName] || 0);
      tenderVariances[tenderName] = {
        processed: roundMoney(tenderBreakdown[tenderName] || 0),
        counted,
        variance: roundMoney(counted - expectedAmount),
      };
      totalCountedAmount = roundMoney(totalCountedAmount + counted);
    }

    const expectedClosingBalance = roundMoney(Number(till.openingBalance || 0) + totalSales);
    const totalVariance = roundMoney(totalCountedAmount - expectedClosingBalance);
    const variancePercentage = expectedClosingBalance > 0
      ? (totalVariance / expectedClosingBalance) * 100
      : 0;

    // Update till with closing details (idempotent)
    console.log(`🔄 Updating till ${till._id} with closing details...`);
    const updatePayload = {
      status: "CLOSED",
      closedAt: new Date(),
      physicalCount: totalCountedAmount,
      expectedClosingBalance: expectedClosingBalance,
      variance: totalVariance,
      totalSales: totalSales,
      transactionCount,
      tenderBreakdown: tenderBreakdown,
      tenderVariances: tenderVariances,
      closingNotes: closingNotes || "",
    };

    const updateResult = await Till.updateOne(
      { _id: till._id, status: "OPEN" },
      { $set: updatePayload }
    );

    if (updateResult.matchedCount === 0) {
      console.warn("⚠️ Till was already closed by another request.");
      const existingReport = await EndOfDayReport.findOne({ tillId: till._id });
      const latestTill = await Till.findById(till._id).lean();
      return res.status(200).json({
        message: "Till already closed",
        till: latestTill || till,
        reportId: existingReport?._id || null,
      });
    }

    const updatedTill = await Till.findById(till._id);
    console.log(`✅ Till saved successfully!`);

    // Create EndOfDayReport for inventory manager access
    try {
      // Fetch actual location name from Store
      let locationName = "Unknown";
      if (till.storeId && till.locationId) {
        const store = await Store.findById(till.storeId);
        if (store && store.locations) {
          const location = store.locations.find(
            (loc) => loc._id.toString() === till.locationId.toString()
          );
          if (location) {
            locationName = location.name;
          }
        }
      }
      console.log(`📍 Location Name: ${locationName}`);

      const existingReport = await EndOfDayReport.findOne({ tillId: till._id });
      if (existingReport) {
        console.log(`📊 EndOfDayReport already exists - ID: ${existingReport._id}`);
      } else {
        // Build tenderActual map (physical counted amounts per tender)
        const tenderActualMap = {};
        for (const [tenderId, countedAmount] of Object.entries(safeTenderCounts)) {
          const tenderName = tenderMap[tenderId];
          if (tenderName) {
            tenderActualMap[tenderName] = parseFloat(countedAmount) || 0;
          }
        }

        const report = new EndOfDayReport({
        storeId: updatedTill.storeId,
        locationId: updatedTill.locationId,
        locationName: locationName,
        tillId: updatedTill._id,
        staffId: updatedTill.staffId,
        staffName: updatedTill.staffName,
        closedBy: updatedTill.staffId,
        openedAt: updatedTill.openedAt,
        openingBalance: updatedTill.openingBalance,
        closedAt: new Date(),
        physicalCount: totalCountedAmount,
        expectedClosingBalance: expectedClosingBalance,
        variance: totalVariance,
        variancePercentage: variancePercentage,
        totalSales: totalSales,
        transactionCount,
        tenderBreakdown: new Map(Object.entries(tenderBreakdown)),
        tenderActual: new Map(Object.entries(tenderActualMap)),
        tenderVariances: new Map(Object.entries(tenderVariances)),
        closingNotes: closingNotes || "",
        status: Math.abs(totalVariance) < 0.01 ? "RECONCILED" : "VARIANCE_NOTED",
        date: new Date().setHours(0, 0, 0, 0),
        });

        try {
          await report.save();
          console.log(`📊 EndOfDayReport created - ID: ${report._id}`);
        } catch (err) {
          if (err?.code === 11000) {
            console.warn("⚠️ EndOfDayReport duplicate prevented by unique index.");
          } else {
            throw err;
          }
        }
      }
    } catch (reportErr) {
      console.warn("⚠️ Warning: Failed to create EndOfDayReport:", reportErr.message);
      // Continue anyway - till is closed, just missing the report
    }

    console.log(`✅ Till closed - Total Variance: ${totalVariance}`);

    // Convert Maps to objects for JSON serialization
    const sourceTill = updatedTill || till;
    const tillResponse = sourceTill.toObject();
    
    const tenderBreakdownObj = extractMapToObject(sourceTill.tenderBreakdown, tillResponse.tenderBreakdown);
    const tenderVariancesObj = extractMapToObject(sourceTill.tenderVariances, tillResponse.tenderVariances);
    
    tillResponse.tenderBreakdown = tenderBreakdownObj;
    tillResponse.tenderVariances = tenderVariancesObj;

    return res.status(200).json({
      message: "Till closed successfully",
      till: tillResponse,
      summary: {
        openingBalance: till.openingBalance,
        totalSales: totalSales,
        expectedClosingBalance: expectedClosingBalance,
        totalCountedAmount: totalCountedAmount,
        totalVariance: totalVariance,
        transactionCount,
        tenderBreakdown: tenderBreakdownObj,
        tenderVariances: tenderVariancesObj, // Detailed variance per tender
      },
    });
  } catch (error) {
    console.error("❌ Error closing till:", error.message);
    console.error("❌ Error stack:", error.stack);
    return res.status(500).json({
      message: "Failed to close till",
      error: error.message,
    });
  }
}
