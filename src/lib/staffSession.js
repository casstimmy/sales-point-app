/**
 * Server-side staff checks for POS API routes.
 *
 * The middleware verifies the session cookie and forwards the staff id in
 * `x-auth-staff-id`. These helpers load that staff member so routes can check
 * they are still active and hold the POS permission an action needs.
 */

import mongoose from 'mongoose';
import { Staff } from '@/src/models/Staff';
import { normalizePosPermissions } from '@/src/lib/posPermissions';

export async function getSessionStaff(req) {
  const staffId = String(req.headers['x-auth-staff-id'] || '').trim();
  if (!staffId || !mongoose.Types.ObjectId.isValid(staffId)) return null;

  const staff = await Staff.findById(staffId).select('_id name role isActive posPermissions').lean();
  if (!staff) return null;

  return {
    ...staff,
    _id: String(staff._id),
    posPermissions: normalizePosPermissions(staff.role, staff.posPermissions),
  };
}

/**
 * Loads the session staff member and, when a permission key is given, checks it.
 * Sends the error response itself and returns null when the request must stop.
 */
export async function requireSessionStaff(req, res, permissionKey = null) {
  const staff = await getSessionStaff(req);

  if (!staff) {
    res.status(401).json({ success: false, code: 'AUTH_REQUIRED', message: 'Please sign in again.' });
    return null;
  }

  if (staff.isActive === false) {
    res.status(403).json({ success: false, code: 'STAFF_INACTIVE', message: 'This staff account is inactive.' });
    return null;
  }

  if (permissionKey && !staff.posPermissions?.[permissionKey]) {
    res.status(403).json({
      success: false,
      code: 'PERMISSION_DENIED',
      message: 'You do not have permission to do this. Ask a manager.',
    });
    return null;
  }

  return staff;
}
