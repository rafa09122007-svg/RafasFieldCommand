export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });
    const { image } = req.body;
    if (!image) return res.status(400).json({ error: 'No image provided' });
    try {
        const apiKey = process.env.NVIDIA_API_KEY || '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';
        if (!apiKey) return res.status(500).json({ error: 'NVIDIA API Key not configured' });
        const payload = {
            model: 'meta/llama-3.2-90b-vision-instruct',
            messages: [{
                role: 'user',
                content: [
                    { type: 'text', text: 'Analyze this image. 1. Find the primary document (receipt, ticket, paper). Do NOT select hands, keyboards, or background. Return its 4 corners as normalized coordinates (0 to 1) in a array `points`: [ {x,y} for top-left, {x,y} for top-right, {x,y} for bottom-right, {x,y} for bottom-left]. If no document is visible, use default points near the edges. 2. Read the text on the document. Correct any spelling or grammar mistakes instantly. Return the corrected text as a string `text`. Output cleanly ONLY the JSON object exactly like this: { "points": [{"x":0.1,"y":0.1},{"x":0.9,"y":0.1},{"x":0.9,"y":0.9},{"x":0.1,"y":0.9}], "text": "Corrected text here" }' },
                    { type: 'image_url', image_url: { url: image } }
                ]
            }],
            max_tokens: 500,
            temperature: 0.1,
            top_p: 1
        };
        const nvidiaRes = await fetch('https://integrate.api.nvidia.com/v1/chat/completions', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        if (!nvidiaRes.ok) return res.status(nvidiaRes.status).json({ error: 'NVIDIA API Error' });
        const data = await nvidiaRes.json();
        const content = data.choices[0].message.content.trim();
        let out = { points: [{ x: 0.05, y: 0.05 }, { x: 0.95, y: 0.05 }, { x: 0.95, y: 0.95 }, { x: 0.05, y: 0.95 }], text: "" };
        try {
            const parsed = JSON.parse(content.replace(/```json/g, '').replace(/```/g, ''));
            if (parsed.points && Array.isArray(parsed.points) && parsed.points.length === 4) out.points = parsed.points;
            if (parsed.text) out.text = parsed.text;
        } catch (e) { }
        return res.status(200).json(out);
    } catch (error) {
        return res.status(500).json({ error: 'Internal Server Error' });
    }
}
