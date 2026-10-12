'use strict';
const { sendMail } = require('./mailer');

const support = () => ({
  phone: process.env.SUPPORT_PHONE || '0554304847',
  email: process.env.SUPPORT_EMAIL || 'predaneynathanaelzebell@gmail.com'
});
const trackUrl = ref => `${process.env.BASE_URL || ''}/track.html?ref=${encodeURIComponent(ref)}`;
const ghs = o => `GHS ${(o.amount / 100).toFixed(2)}`;

/** Called exactly once per order, when it first becomes "paid". */
function notifyPaid(order) {
  if (!order) return;
  const s = support();
  let details = '';
  if (order.details) {
    try { details = '\n' + Object.entries(JSON.parse(order.details)).map(([k, v]) => `${k}: ${v}`).join('\n'); } catch { /* ignore */ }
  }

  // 1) Alert to the owner
  sendMail(process.env.ALERT_EMAIL_TO || s.email,
    `New paid order: ${order.service} ${order.description}`,
    `You have a new PAID order.\n\n` +
    `Order: ${order.service} - ${order.description}\nAmount: ${ghs(order)}\n` +
    `Send to phone: ${order.phone}\nCustomer email: ${order.email}\nReference: ${order.reference}${details}\n\n` +
    `Mark it delivered on your admin page when done.`);

  // 2) Confirmation to the customer
  sendMail(order.email,
    `Payment received - ${order.service} ${order.description}`,
    `Thank you for your order at Oracle's Data Hub!\n\n` +
    `We have received your payment of ${ghs(order)} for ${order.service} - ${order.description}.\n` +
    `It will be sent to: ${order.phone}\nYour order reference: ${order.reference}\n\n` +
    `Track your order: ${trackUrl(order.reference)}\n` +
    `(You will need the reference above and the phone number you ordered with.)\n\n` +
    `If you have not received it, contact us on ${s.phone} or ${s.email}.`);
}

/** Called when you mark an order delivered in the admin page. */
function notifyDelivered(order) {
  if (!order) return;
  const s = support();
  sendMail(order.email,
    `Delivered - ${order.service} ${order.description}`,
    `Good news! Your order (${order.service} - ${order.description}) has been marked as delivered to ${order.phone}.\n` +
    `Reference: ${order.reference}\n\nNot received? Contact us on ${s.phone} or ${s.email}.`);
}

module.exports = { notifyPaid, notifyDelivered, support };
