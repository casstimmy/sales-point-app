/**
 * Session Authentication
 * 
 * HMAC-SHA256 signed session tokens for in-house POS.
 * Tokens are set as HttpOnly cookies on staff PIN login.
 */

import crypto from 'crypto';

const SESSION_COOKIE = 'pos-session';
const SESSION_MAX_AGE_SECONDS = 30 * 24 * 60 * 60; // 30 days

function getSecret() {
  return process.env.SESSION_SECRET || process.env.NEXTAUTH_SECRET || 'pos-inhouse-default-key';
}

/**
 * Create a signed session token for a staff member
 * Format: staffId.timestamp.hmacHex
 */
export function createSessionToken(staffId) {
  const timestamp = Date.now().toString();
  const data = `${staffId}.${timestamp}`;
  const signature = crypto.createHmac('sha256', getSecret()).update(data).digest('hex');
  return `${staffId}.${timestamp}.${signature}`;
}

/**
 * Verify a session token and return the staff ID, or null if invalid
 */
export function verifySessionToken(token) {
  try {
    if (!token || typeof token !== 'string') return null;

    const parts = token.split('.');
    if (parts.length !== 3) return null;

    const [staffId, timestamp, signature] = parts;
    const loginTime = parseInt(timestamp, 10);

    if (isNaN(loginTime)) return null;

    // Check expiry
    if (Date.now() - loginTime > SESSION_MAX_AGE_SECONDS * 1000) return null;

    // Verify HMAC
    const data = `${staffId}.${timestamp}`;
    const expected = crypto.createHmac('sha256', getSecret()).update(data).digest('hex');

    if (!crypto.timingSafeEqual(Buffer.from(signature, 'hex'), Buffer.from(expected, 'hex'))) {
      return null;
    }

    return { staffId, loginTime };
  } catch {
    return null;
  }
}

/**
 * Set session cookie on the response after successful login
 */
export function setSessionCookie(res, staffId) {
  const token = createSessionToken(staffId);
  const isProduction = process.env.NODE_ENV === 'production';

  res.setHeader('Set-Cookie',
    `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${SESSION_MAX_AGE_SECONDS}${isProduction ? '; Secure' : ''}`
  );

  return token;
}

/**
 * Clear session cookie (logout)
 */
export function clearSessionCookie(res) {
  res.setHeader('Set-Cookie',
    `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0`
  );
}
