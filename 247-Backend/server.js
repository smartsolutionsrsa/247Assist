/**
 * 247 Assistance - Express.js Payment Gateway Server
 * Handles PayFast Payment Link Generation & Webhooks for WhatsApp Chatbots
 */

const express = require('express');
const crypto = require('crypto');
const axios = require('axios');

const app = express();

// Middleware to parse URL-encoded bodies (PayFast ITN) and JSON (Botpress/Fastbots webhooks)
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// PayFast Configuration — Pre-configured with your Live Credentials
const PAYFAST_CONFIG = {
  merchant_id: process.env.PAYFAST_MERCHANT_ID || '37644817',
  merchant_key: process.env.PAYFAST_MERCHANT_KEY || 'lsuc4fr9gwpmg',
  passphrase: process.env.PAYFAST_PASSPHRASE || '', // Optional: Add your custom passphrase set in PayFast dashboard if enabled
  
  // URL switches to Live PayFast by default. For testing sandbox, set PAYFAST_ENV=sandbox in environment variables
  payfast_url: process.env.PAYFAST_ENV === 'sandbox' 
    ? 'https://sandbox.payfast.co.za/eng/process' 
    : 'https://www.payfast.co.za/eng/process',
    
  return_url: process.env.RETURN_URL || 'https://247assistance.netlify.app/payment-success',
  cancel_url: process.env.CANCEL_URL || 'https://247assistance.netlify.app/payment-cancelled',
  notify_url: process.env.NOTIFY_URL || 'https://your-api-domain.onrender.com/api/payfast/webhook'
};

/**
 * Utility: Generates PayFast MD5 Signature for secure transaction verification
 */
function generateSignature(data, passphrase = '') {
  let pfOutput = '';
  for (let key in data) {
    if (data.hasOwnProperty(key) && data[key] !== '' && key !== 'signature') {
      pfOutput += `${key}=${encodeURIComponent(data[key].trim()).replace(/%20/g, '+')}&`;
    }
  }
  // Trim trailing ampersand
  pfOutput = pfOutput.slice(0, -1);

  if (passphrase) {
    pfOutput += `&passphrase=${encodeURIComponent(passphrase.trim()).replace(/%20/g, '+')}`;
  }

  return crypto.createHash('md5').update(pfOutput).digest('hex');
}

/**
 * Health Check Endpoint
 */
app.get('/', (req, res) => {
  res.send('✅ 247 Assistance Payment Backend is Active & Running.');
});

/**
 * 1. API Endpoint: Called by Chatbot (Botpress/Fastbots) to generate a PayFast Payment Link
 * Body required: { "amount": "250.00", "itemName": "Dental Booking Deposit", "customerPhone": "27712345678" }
 */
app.post('/api/generate-payment-link', (req, res) => {
  try {
    const { amount, itemName, customerPhone, orderId } = req.body;

    if (!amount || !itemName || !customerPhone) {
      return res.status(400).json({
        success: false,
        error: 'Missing required parameters: amount, itemName, or customerPhone'
      });
    }

    // Format PayFast data payload
    const paymentData = {
      merchant_id: PAYFAST_CONFIG.merchant_id,
      merchant_key: PAYFAST_CONFIG.merchant_key,
      return_url: PAYFAST_CONFIG.return_url,
      cancel_url: PAYFAST_CONFIG.cancel_url,
      notify_url: PAYFAST_CONFIG.notify_url,
      m_payment_id: orderId || `ORD-${Date.now()}`,
      amount: parseFloat(amount).toFixed(2),
      item_name: itemName.substring(0, 100), // Max length 100 chars
      custom_str1: customerPhone // Store customer phone number to use in webhook
    };

    // Calculate MD5 Signature
    paymentData.signature = generateSignature(paymentData, PAYFAST_CONFIG.passphrase);

    // Build final payment redirect URL
    const queryParams = new URLSearchParams(paymentData).toString();
    const paymentUrl = `${PAYFAST_CONFIG.payfast_url}?${queryParams}`;

    return res.json({
      success: true,
      orderId: paymentData.m_payment_id,
      amount: paymentData.amount,
      paymentUrl: paymentUrl
    });

  } catch (error) {
    console.error('Error generating payment link:', error);
    return res.status(500).json({ success: false, error: 'Internal Server Error' });
  }
});

/**
 * 2. Webhook Endpoint: Called automatically by PayFast (Instant Transaction Notification - ITN)
 * Triggered after customer pays via Capitec Pay, Card, or Instant EFT
 */
app.post('/api/payfast/webhook', async (req, res) => {
  // PayFast requires returning an HTTP 200 OK header immediately
  res.status(200).send('OK');

  const pfData = req.body;
  console.log('Received PayFast Notification:', pfData);

  const paymentStatus = pfData.payment_status;
  const customerPhone = pfData.custom_str1;
  const amountPaid = pfData.amount_gross;
  const orderId = pfData.m_payment_id;

  if (paymentStatus === 'COMPLETE') {
    console.log(`🎉 SUCCESS: Payment of R${amountPaid} for Order ${orderId} received from ${customerPhone}`);
    await handleSuccessfulPayment(customerPhone, orderId, amountPaid);
  } else {
    console.log(`⚠️ Payment Status '${paymentStatus}' for Order ${orderId}`);
  }
});

/**
 * Helper function to process successful orders (Send confirmation back to Chatbot/Client)
 */
async function handleSuccessfulPayment(phone, orderId, amount) {
  console.log(`Dispatching WhatsApp confirmation to phone: ${phone} for Order #${orderId}`);
}

// Start Server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 247 Assistance Express server listening on port ${PORT}`);
});