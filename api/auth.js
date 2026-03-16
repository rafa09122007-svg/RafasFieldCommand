export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }
    if (!req.body || typeof req.body.phone !== 'string') {
        return res.status(400).json({ error: 'Invalid payload' });
    }
    const phone = req.body.phone.replace(/\D/g, "");
    if (phone.length < 10 || phone.length > 15) {
        return res.status(400).json({ error: 'Invalid phone number' });
    }
    try {
        const API_URL = process.env.GOOGLE_SCRIPT_URL || "https://script.google.com/macros/s/AKfycbz4FfwBoS-YwiVsy9HwCuvF8N2qoTmfbWv25-yHjMvm2Ikoi9KBP-rkOvXYMgiXOu7r/exec";
        const response = await fetch(`${API_URL}?action=checkAuth&phone=${encodeURIComponent(phone)}`);
        const text = await response.text();
        try {
            const data = JSON.parse(text);
            if (Array.isArray(data)) {
                const validNumbers = data.map(n => n.replace(/\D/g, ""));
                if (validNumbers.includes(phone)) {
                    return res.status(200).json({ authorized: true, token: Buffer.from(phone).toString('base64') });
                }
            } else if (data.authorized) {
                return res.status(200).json({ authorized: true, token: Buffer.from(phone).toString('base64') });
            }
        } catch (e) {
            const validNumbers = text.split(/\r?\n/).map(n => n.replace(/\D/g, ""));
            if (validNumbers.includes(phone)) {
                return res.status(200).json({ authorized: true, token: Buffer.from(phone).toString('base64') });
            }
        }
        return res.status(401).json({ authorized: false, error: 'Unauthorized' });
    } catch (error) {
        return res.status(500).json({ error: 'Internal Server Error' });
    }
}
