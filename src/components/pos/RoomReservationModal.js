import React, { useEffect, useMemo, useState } from "react";

function toDateInputValue(value) {
  if (!value) return "";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "";
  return parsed.toISOString().slice(0, 10);
}

function createDefaultReservation() {
  const checkInDate = new Date();
  const checkOutDate = new Date(checkInDate);
  checkOutDate.setDate(checkOutDate.getDate() + 1);

  return {
    guestName: "",
    guestPhone: "",
    checkInDate: toDateInputValue(checkInDate),
    checkOutDate: toDateInputValue(checkOutDate),
    notes: "",
  };
}

export default function RoomReservationModal({ product, initialReservation, onClose, onConfirm }) {
  const [guestName, setGuestName] = useState("");
  const [guestPhone, setGuestPhone] = useState("");
  const [checkInDate, setCheckInDate] = useState("");
  const [checkOutDate, setCheckOutDate] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState("");

  const defaults = useMemo(() => createDefaultReservation(), []);

  useEffect(() => {
    if (!product) return;

    setGuestName(initialReservation?.guestName || defaults.guestName);
    setGuestPhone(initialReservation?.guestPhone || defaults.guestPhone);
    setCheckInDate(toDateInputValue(initialReservation?.checkInAt) || defaults.checkInDate);
    setCheckOutDate(toDateInputValue(initialReservation?.checkOutAt) || defaults.checkOutDate);
    setNotes(initialReservation?.notes || defaults.notes);
    setError("");
  }, [defaults, initialReservation, product]);

  if (!product) return null;

  const handleSubmit = (event) => {
    event.preventDefault();

    const trimmedGuestName = guestName.trim();
    if (!trimmedGuestName) {
      setError("Guest name is required for a room booking.");
      return;
    }

    if (!checkInDate || !checkOutDate) {
      setError("Check-in and check-out dates are required.");
      return;
    }

    const checkInAt = new Date(checkInDate);
    const checkOutAt = new Date(checkOutDate);
    if (
      Number.isNaN(checkInAt.getTime()) ||
      Number.isNaN(checkOutAt.getTime()) ||
      checkOutAt <= checkInAt
    ) {
      setError("Check-out date must be after check-in date.");
      return;
    }

    onConfirm({
      guestName: trimmedGuestName,
      guestPhone: guestPhone.trim(),
      checkInAt: checkInAt.toISOString(),
      checkOutAt: checkOutAt.toISOString(),
      notes: notes.trim(),
    });
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-xl rounded-2xl border border-neutral-200 bg-white shadow-2xl overflow-hidden">
        <div className="border-b border-neutral-200 bg-gradient-to-r from-cyan-600 to-cyan-700 px-5 py-4 text-white">
          <div className="text-lg font-bold">Book Room</div>
          <div className="text-sm text-cyan-100 mt-1">{product.name} · ₦{Math.round(product.salePriceIncTax || 0).toLocaleString()}</div>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <label className="block">
              <span className="block text-sm font-semibold text-neutral-700 mb-1">Guest Name</span>
              <input
                type="text"
                value={guestName}
                onChange={(event) => setGuestName(event.target.value)}
                className="w-full rounded-xl border border-neutral-300 px-3 py-2.5 text-sm outline-none transition focus:border-cyan-500 focus:ring-2 focus:ring-cyan-100"
                placeholder="Guest full name"
              />
            </label>

            <label className="block">
              <span className="block text-sm font-semibold text-neutral-700 mb-1">Phone</span>
              <input
                type="text"
                value={guestPhone}
                onChange={(event) => setGuestPhone(event.target.value)}
                className="w-full rounded-xl border border-neutral-300 px-3 py-2.5 text-sm outline-none transition focus:border-cyan-500 focus:ring-2 focus:ring-cyan-100"
                placeholder="Guest phone number"
              />
            </label>

            <label className="block">
              <span className="block text-sm font-semibold text-neutral-700 mb-1">Check-In</span>
              <input
                type="date"
                value={checkInDate}
                onChange={(event) => setCheckInDate(event.target.value)}
                className="w-full rounded-xl border border-neutral-300 px-3 py-2.5 text-sm outline-none transition focus:border-cyan-500 focus:ring-2 focus:ring-cyan-100"
              />
            </label>

            <label className="block">
              <span className="block text-sm font-semibold text-neutral-700 mb-1">Check-Out</span>
              <input
                type="date"
                value={checkOutDate}
                onChange={(event) => setCheckOutDate(event.target.value)}
                className="w-full rounded-xl border border-neutral-300 px-3 py-2.5 text-sm outline-none transition focus:border-cyan-500 focus:ring-2 focus:ring-cyan-100"
              />
            </label>
          </div>

          <label className="block">
            <span className="block text-sm font-semibold text-neutral-700 mb-1">Booking Notes</span>
            <textarea
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              className="min-h-[100px] w-full rounded-xl border border-neutral-300 px-3 py-2.5 text-sm outline-none transition focus:border-cyan-500 focus:ring-2 focus:ring-cyan-100"
              placeholder="Arrival time, special requests, or booking notes"
            />
          </label>

          <div className="rounded-xl border border-cyan-100 bg-cyan-50 px-4 py-3 text-sm text-cyan-900">
            Room bookings stay at a fixed quantity of 1 and save guest details with the transaction.
          </div>

          {error && (
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}

          <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-neutral-300 px-4 py-2.5 text-sm font-semibold text-neutral-700 transition hover:bg-neutral-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="rounded-xl bg-cyan-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-cyan-700"
            >
              Save Booking
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}