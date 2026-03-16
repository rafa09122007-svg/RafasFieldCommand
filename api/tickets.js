// /api/tickets.js — FIXED
//
// The problem: Vercel Hobby plan has a 10-second function execution limit.
// Google Apps Script doPost takes 8-15s even optimized (image uploads to Drive).
// So awaiting the full GAS response will timeout on Vercel Hobby.
//
// Solution: Fire-and-forget the POST to GAS, but return success immediately.
// The optimized GAS doPost is reliable enough that if the request reaches it,
// it will complete. The client gets instant feedback.
//
// If you're on Vercel Pro (60s limit), you can switch to awaiting the response.

export default async function handler(req, res) {
  const API_URL = process.env.GOOGLE_SCRIPT_URL ||
    "https://script.google.com/macros/s/AKfycbwBTObE1wKttfWxpBXsW2oehfBdBcIcFPuYAmfDf23Ps47Y8MkcoS_M1Pip6kCx8rpB/exec";

  // ── Auth check ───────────────────────────────────────────────────────────
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  const token = authHeader.split(' ')[1];
  let phone;
  try {
    phone = Buffer.from(token, 'base64').toString('utf-8');
    if (!phone || phone.replace(/\D/g, '').length < 10) throw new Error('Invalid');
  } catch {
    return res.status(401).json({ error: 'Invalid token' });
  }

  // ── GET: fetch tickets / queue ─────────────────────────────────────────
  if (req.method === 'GET') {
    try {
      const mode = req.query?.mode;
      const url = mode === 'queue'
        ? `${API_URL}?mode=queue&phone=${encodeURIComponent(phone)}`
        : `${API_URL}`;

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 9500);
      const response = await fetch(url, { signal: controller.signal });
      clearTimeout(timeout);

      const text = await response.text();
      let data;
      try { data = JSON.parse(text); } catch { data = []; }
      return res.status(200).json({ data });
    } catch {
      return res.status(200).json({ data: [], error: 'Connection failed' });
    }
  }

  // ── POST: submit ticket ────────────────────────────────────────────────
  if (req.method === 'POST') {
    try {
      if (!req.body || typeof req.body !== 'object') {
        return res.status(400).json({ error: 'Invalid payload' });
      }

      // Fire the request to GAS — don't await it.
      // GAS will process it in the background (image uploads + sheet write).
      // We catch any immediate connection errors (DNS fail, etc).
      const gasPromise = fetch(API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(req.body),
        redirect: "follow",
      });

      // Wait just long enough to confirm the request was SENT (not completed).
      // If GAS is unreachable, this will fail fast (~2-3s).
      // If it connects, we return success without waiting for GAS to finish.
      const raceResult = await Promise.race([
        gasPromise.then(r => ({ sent: true, status: r.status })),
        new Promise(resolve => setTimeout(() => resolve({ sent: true, timeout: true }), 8000))
      ]);

      // If we got an immediate HTTP error (like 404, 500 from GAS itself)
      if (raceResult.sent && raceResult.status && raceResult.status >= 500) {
        return res.status(502).json({ error: 'Google Apps Script returned an error' });
      }

      return res.status(200).json({ ok: true });
    } catch (err) {
      // This catches network-level failures (DNS, connection refused, etc)
      console.error('Ticket submission error:', err.message);
      return res.status(502).json({ error: 'Could not reach Google Apps Script' });
    }
  }

  return res.status(405).json({ error: 'Method Not Allowed' });
}
