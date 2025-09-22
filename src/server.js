import 'dotenv/config';
import { createServer } from 'http';
import { readFile } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { KanbanBot } from './bot.js';
import { KanbanWebSocketServer } from './websocket.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

if (!process.env.BOT_TOKEN) {
    console.error('❌ ERROR: BOT_TOKEN is required in .env file');
    process.exit(1);
}

const server = createServer(async (req, res) => {
    try {
        // CORS headers
        res.setHeader('Access-Control-Allow-Origin', 'https://risse-gloom.github.io');
res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
        
        // Handle preflight requests
        if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
}
        
        const url = req.url === '/' ? '/index.html' : req.url;
        const filePath = join(__dirname, url);
        
        let contentType = 'text/html';
        if (filePath.endsWith('.css')) contentType = 'text/css';
        if (filePath.endsWith('.js')) contentType = 'application/javascript';
        if (filePath.endsWith('.png')) contentType = 'image/png';
        if (filePath.endsWith('.jpg')) contentType = 'image/jpeg';
        
        const content = await readFile(filePath, 'utf-8');
        
        res.writeHead(200, { 
            'Content-Type': contentType,
            'Content-Security-Policy': "default-src 'self' https:; connect-src 'self' ws: wss:;"
        });
        res.end(content);
    } catch (error) {
        res.writeHead(404);
        res.end('File not found');
    }
});

const bot = new KanbanBot();
const wss = new KanbanWebSocketServer(bot, server);

bot.launch();

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`🚀 HTTP Server running on port ${PORT}`);
    console.log(`📋 Kanban App: http://localhost:${PORT}`);
});

// Graceful shutdown
const shutdown = () => {
    console.log('\n🛑 Shutting down...');
    bot.stop();
    wss.stop();
    server.close(() => {
        console.log('HTTP server closed.');
        process.exit(0);
    });
};

process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);
process.on('unhandledRejection', (error) => {
    console.error('Unhandled rejection:', error);
});

