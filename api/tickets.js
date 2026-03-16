export const config = {
  api: {
    bodyParser: {
      sizeLimit: '50mb',
    },
  },
};

export default async function handler(req, res) {
  const API_URL = process.env.GOOGLE_SCRIPT_URL ||
    "https://script.google.com/macros/s/AKfycbwBTObE1wKttfWxpBXsW2oehfBdBcIcFPuYAmfDf23Ps47Y8MkcoS_M1Pip6kCx8rpB/exec";

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

  if (req.method === 'POST') {
    try {
      if (!req.body || typeof req.body !== 'object') {
        return res.status(400).json({ error: 'Invalid payload' });
      }

      // MUST await — Vercel terminates background fetches once response is sent.
      // GAS optimized doPost takes ~8-15s (image uploads + sheet write).
      // We race against a 25s timeout so we don't hit Vercel's 30s limit.
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 25000);

      try {
        const gasRes = await fetch(API_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(req.body),
          redirect: "follow",
          signal: controller.signal,
        });
        clearTimeout(timeout);

        const text = await gasRes.text();
        let result;
        try { result = JSON.parse(text); } catch { result = { success: true }; }

        return res.status(200).json({ ok: true, submissionId: result.submissionId });
      } catch (fetchErr) {
        clearTimeout(timeout);
        // Timeout = GAS is still processing, it will finish on its own
        if (fetchErr.name === 'AbortError') {
          return res.status(200).json({ ok: true, warning: 'Processing — data will appear shortly' });
        }
        return res.status(200).json({ ok: true, warning: fetchErr.message });
      }
    } catch (err) {
      return res.status(200).json({ ok: true, warning: err.message });
    }
  }

  return res.status(405).json({ error: 'Method Not Allowed' });
}
