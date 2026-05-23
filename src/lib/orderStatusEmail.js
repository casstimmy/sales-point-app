import nodemailer from 'nodemailer';
import Store from '@/src/models/Store';

const DEFAULT_BRAND_NAME = "St's Micheals";

const getOrderContactDetails = (order) =>
  order?.shippingDetails || order?.customerSnapshot || order?.customer || {};

const getOrderItems = (order) => {
  if (Array.isArray(order?.cartProducts) && order.cartProducts.length > 0) {
    return order.cartProducts;
  }

  return Array.isArray(order?.items) ? order.items : [];
};

const resolveBaseUrl = () =>
  [
    process.env.NEXT_PUBLIC_APP_URL,
    process.env.APP_URL,
    process.env.NEXTAUTH_URL,
    process.env.SITE_URL,
  ].find((value) => typeof value === 'string' && value.trim()) || '';

const resolveLogoUrl = (logoPath = '') => {
  const candidate = String(process.env.LOGO_URL || logoPath || '').trim();
  if (!candidate) {
    return '';
  }

  if (/^https?:\/\//i.test(candidate)) {
    return candidate;
  }

  const baseUrl = resolveBaseUrl();
  if (!baseUrl) {
    return '';
  }

  try {
    return new URL(candidate.startsWith('/') ? candidate : `/${candidate}`, baseUrl).toString();
  } catch {
    return '';
  }
};

async function getBranding() {
  try {
    const store = await Store.findOne({}).lean();
    return {
      brandName:
        store?.companyDisplayName ||
        store?.companyName ||
        store?.storeName ||
        DEFAULT_BRAND_NAME,
      logoUrl: resolveLogoUrl(store?.logo),
      contactEmail: store?.email || process.env.EMAIL_USER || '',
      website: store?.website || '',
      storeName: store?.storeName || store?.companyDisplayName || DEFAULT_BRAND_NAME,
    };
  } catch {
    return {
      brandName: DEFAULT_BRAND_NAME,
      logoUrl: resolveLogoUrl(''),
      contactEmail: process.env.EMAIL_USER || '',
      website: '',
      storeName: DEFAULT_BRAND_NAME,
    };
  }
}

function buildEmailHtml({
  order,
  accentColor,
  subjectLine,
  headline,
  intro,
  statusLabel,
  branding,
}) {
  const contact = getOrderContactDetails(order);
  const items = getOrderItems(order);
  const logoMarkup = branding.logoUrl
    ? `<img src="${branding.logoUrl}" alt="${branding.brandName}" style="max-width: 88px; max-height: 88px; display: block; margin: 0 auto 14px; object-fit: contain;" />`
    : '';
  const itemsMarkup = items
    .map((item) => {
      const quantity = Number(item?.quantity || item?.qty || 0);
      const price = Number(item?.price || item?.salePriceIncTax || 0);
      return `
        <tr>
          <td style="padding: 10px 0; border-bottom: 1px solid #e5e7eb; color: #0f172a;">${item?.name || 'Item'}</td>
          <td style="padding: 10px 0; border-bottom: 1px solid #e5e7eb; text-align: center; color: #475569;">${quantity}</td>
          <td style="padding: 10px 0; border-bottom: 1px solid #e5e7eb; text-align: right; color: #0f172a;">₦${price.toLocaleString('en-NG')}</td>
        </tr>
      `;
    })
    .join('');

  return `
    <div style="font-family: 'Segoe UI', Arial, sans-serif; background: #f4f7fb; padding: 24px; color: #0f172a;">
      <div style="max-width: 640px; margin: 0 auto; background: #ffffff; border-radius: 22px; overflow: hidden; box-shadow: 0 20px 45px rgba(15, 23, 42, 0.12);">
        <div style="background: linear-gradient(135deg, ${accentColor}, #0f172a); padding: 28px 24px; text-align: center; color: #ffffff;">
          ${logoMarkup}
          <div style="font-size: 13px; letter-spacing: 0.18em; text-transform: uppercase; opacity: 0.78;">${branding.storeName}</div>
          <h1 style="margin: 12px 0 8px; font-size: 28px; line-height: 1.2;">${headline}</h1>
          <p style="margin: 0; font-size: 15px; opacity: 0.88;">${subjectLine}</p>
        </div>

        <div style="padding: 28px 24px 30px;">
          <p style="margin: 0 0 12px; font-size: 16px;">Hi <strong>${order?.customer?.name || contact?.name || 'Customer'}</strong>,</p>
          <p style="margin: 0 0 24px; font-size: 15px; line-height: 1.65; color: #475569;">${intro}</p>

          <div style="border: 1px solid #e2e8f0; border-radius: 16px; padding: 16px 18px; background: #f8fafc; margin-bottom: 24px;">
            <div style="font-size: 12px; text-transform: uppercase; letter-spacing: 0.16em; color: #64748b; margin-bottom: 8px;">Order Summary</div>
            <div style="display: flex; justify-content: space-between; gap: 12px; margin-bottom: 6px; font-size: 14px;">
              <span style="color: #64748b;">Order ID</span>
              <strong>${order?._id}</strong>
            </div>
            <div style="display: flex; justify-content: space-between; gap: 12px; margin-bottom: 6px; font-size: 14px;">
              <span style="color: #64748b;">Status</span>
              <strong>${statusLabel}</strong>
            </div>
            <div style="display: flex; justify-content: space-between; gap: 12px; margin-bottom: 6px; font-size: 14px;">
              <span style="color: #64748b;">Payment</span>
              <strong>${order?.paymentStatus || 'Pending'}</strong>
            </div>
            <div style="display: flex; justify-content: space-between; gap: 12px; font-size: 14px;">
              <span style="color: #64748b;">Fulfilment</span>
              <strong>${order?.locationName || 'Assigned from POS'}</strong>
            </div>
          </div>

          <div style="border: 1px solid #e2e8f0; border-radius: 16px; padding: 18px;">
            <h2 style="margin: 0 0 14px; font-size: 18px;">Items</h2>
            <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
              <thead>
                <tr>
                  <th style="padding: 0 0 10px; text-align: left; color: #64748b; font-weight: 600; border-bottom: 1px solid #cbd5e1;">Item</th>
                  <th style="padding: 0 0 10px; text-align: center; color: #64748b; font-weight: 600; border-bottom: 1px solid #cbd5e1;">Qty</th>
                  <th style="padding: 0 0 10px; text-align: right; color: #64748b; font-weight: 600; border-bottom: 1px solid #cbd5e1;">Price</th>
                </tr>
              </thead>
              <tbody>${itemsMarkup}</tbody>
            </table>
            <div style="display: flex; justify-content: space-between; gap: 12px; padding-top: 16px; margin-top: 16px; border-top: 1px solid #cbd5e1; font-size: 16px;">
              <span style="color: #475569;">Total</span>
              <strong>₦${Number(order?.total || 0).toLocaleString('en-NG')}</strong>
            </div>
          </div>

          <div style="margin-top: 24px; border: 1px solid #e2e8f0; border-radius: 16px; padding: 18px; background: #f8fafc;">
            <h2 style="margin: 0 0 12px; font-size: 18px;">Delivery Details</h2>
            <p style="margin: 0 0 6px; font-size: 14px; color: #475569;"><strong style="color: #0f172a;">Name:</strong> ${contact?.name || 'N/A'}</p>
            <p style="margin: 0 0 6px; font-size: 14px; color: #475569;"><strong style="color: #0f172a;">Phone:</strong> ${contact?.phone || 'N/A'}</p>
            <p style="margin: 0; font-size: 14px; color: #475569;"><strong style="color: #0f172a;">Address:</strong> ${contact?.address || 'N/A'}${contact?.city ? `, ${contact.city}` : ''}</p>
          </div>

          <p style="margin: 24px 0 0; font-size: 13px; line-height: 1.7; color: #64748b;">
            Need help with this order? Reply to this email${branding.contactEmail ? ` or contact ${branding.contactEmail}` : ''}${branding.website ? `, or visit ${branding.website}` : ''}.
          </p>
        </div>
      </div>
    </div>
  `;
}

async function sendOrderLifecycleEmail({ order, subjectLine, headline, intro, statusLabel, accentColor }) {
  const contact = getOrderContactDetails(order);
  const recipient = order?.customer?.email || contact?.email || '';

  if (!recipient || !process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
    return 'skipped';
  }

  const branding = await getBranding();
  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
  });

  try {
    await transporter.sendMail({
      from: `"${branding.brandName}" <${process.env.EMAIL_USER}>`,
      to: recipient,
      subject: subjectLine,
      html: buildEmailHtml({
        order,
        accentColor,
        subjectLine,
        headline,
        intro,
        statusLabel,
        branding,
      }),
    });

    return 'sent';
  } catch (error) {
    console.error('Order status email failed:', error.message);
    return 'failed';
  }
}

export async function sendOrderProcessingEmail(order) {
  return sendOrderLifecycleEmail({
    order,
    subjectLine: 'Your order is now being processed',
    headline: 'We have started processing your order',
    intro: 'Your order has been received into our fulfilment workflow and is now being prepared by the POS team. We will notify you again once delivery has been completed.',
    statusLabel: 'Processing',
    accentColor: '#d97706',
  });
}

export async function sendOrderDeliveredEmail(order) {
  return sendOrderLifecycleEmail({
    order,
    subjectLine: 'Your order has been delivered',
    headline: 'Delivery completed successfully',
    intro: 'Your order has now been marked as delivered. Thank you for shopping with us.',
    statusLabel: 'Delivered',
    accentColor: '#0f766e',
  });
}