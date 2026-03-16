import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { pathToFileURL } from 'url';
import path from 'path';
import fs from 'fs';

const vercelApiMock = () => ({
    name: 'vercel-api-mock',
    configureServer(server) {
        server.middlewares.use(async (req, res, next) => {
            if (req.url.startsWith('/api/')) {
                try {
                    const handlerPath = req.url.split('?')[0];
                    const fullPath = path.join(process.cwd(), `${handlerPath}.js`);

                    if (!fs.existsSync(fullPath)) {
                        res.statusCode = 404;
                        res.end(JSON.stringify({ error: 'Not Found' }));
                        return;
                    }

                    const mod = await import(pathToFileURL(fullPath).href + '?update=' + Date.now());
                    const handler = mod.default;

                    res.status = (code) => { res.statusCode = code; return res; };
                    res.json = (data) => {
                        res.setHeader('Content-Type', 'application/json');
                        res.end(JSON.stringify(data));
                    };

                    const execHandler = () => {
                        try {
                            if (typeof req.body === 'string' && req.body) {
                                req.body = JSON.parse(req.body);
                            }
                        } catch (e) { }
                        handler(req, res).catch(err => {
                            console.error(err);
                            res.status(500).json({ error: 'Internal error' });
                        });
                    };

                    if (req.method === 'GET' || req.method === 'HEAD' || req.body !== undefined) {
                        return execHandler();
                    }

                    let body = '';
                    req.on('data', chunk => body += chunk);
                    req.on('end', () => {
                        req.body = body;
                        execHandler();
                    });
                } catch (err) {
                    console.error('Local API Error:', err);
                    res.statusCode = 500;
                    res.end(JSON.stringify({ error: err.message }));
                }
                return;
            }
            next();
        });
    }
});

export default defineConfig({
    plugins: [react(), vercelApiMock()],
});
