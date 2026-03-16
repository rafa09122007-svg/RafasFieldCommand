export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });
    try {
        const { text } = req.body || {};
        if (!text || typeof text !== 'string' || text.trim().length < 3) {
            return res.status(400).json({ error: 'No text provided' });
        }
        const cleaned = text.trim().slice(0, 2000);
        const apiKey = process.env.NVIDIA_API_KEY || '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';
        if (!apiKey) return res.status(500).json({ error: 'API key missing' });
        const payload = {
            model: 'meta/llama-3.2-90b-vision-instruct',
            messages: [{
                role: 'user',
                content: `You are a language detection and translation tool. Analyze the following text and determine if it is in Spanish. If the text IS in Spanish, translate it to English. If the text is NOT in Spanish (English, numbers, codes, etc.), return it EXACTLY as-is with no changes. Respond ONLY with a JSON object in this exact format, nothing else: {"language":"es" or "en","translated":"the text here"}\n\nText: "${cleaned}"`
            }],
            max_tokens: 600,
            temperature: 0.05,
            top_p: 1
        };
        const nvidiaRes = await fetch('https://integrate.api.nvidia.com/v1/chat/completions', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        if (!nvidiaRes.ok) {
            return res.status(200).json({ language: 'en', translated: cleaned });
        }
        const data = await nvidiaRes.json();
        const content = (data.choices?.[0]?.message?.content || '').trim();
        let result = { language: 'en', translated: cleaned };
        try {
            const parsed = JSON.parse(content.replace(/```json/g, '').replace(/```/g, '').trim());
            if (parsed.language && parsed.translated) {
                result.language = parsed.language;
                result.translated = parsed.translated;
            }
        } catch {
            const langMatch = content.match(/"language"\s*:\s*"(es|en)"/i);
            const textMatch = content.match(/"translated"\s*:\s*"([^"]+)"/i);
            if (langMatch) result.language = langMatch[1].toLowerCase();
            if (textMatch) result.translated = textMatch[1];
        }
        return res.status(200).json(result);
    } catch {
        const fallbackText = (req.body?.text || '').trim();
        return res.status(200).json({ language: 'en', translated: fallbackText || '' });
    }
}
