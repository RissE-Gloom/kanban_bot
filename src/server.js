import 'dotenv/config';
import { createServer } from 'http';
import { readFile } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { KanbanBot } from './bot.js';
import { KanbanWebSocketServer } from './websocket.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Проверка обязательных переменных
if (!process.env.BOT_TOKEN) {
    console.error('❌ ERROR: BOT_TOKEN is required in .env file');
    process.exit(1);
}

// Создаем HTTP сервер для обслуживания статики и WebSocket
const server = createServer(async (req, res) => {
    try {
        const url = req.url === '/' ? '/index.html' : req.url;
        const filePath = join(__dirname, url);
        
        // Определяем Content-Type
        let contentType = 'text/html';
        if (filePath.endsWith('.css')) contentType = 'text/css';
        if (filePath.endsWith('.js')) contentType = 'application/javascript';
        if (filePath.endsWith('.png')) contentType = 'image/png';
        if (filePath.endsWith('.jpg')) contentType = 'image/jpeg';
        
        const content = await readFile(filePath, 'utf-8');
        
        res.writeHead(200, { 'Content-Type': contentType });
        res.end(content);
    } catch (error) {
        res.writeHead(404);
        res.end('File not found');
    }
});

// Initialize bot and WebSocket server
const bot = new KanbanBot();
const wss = new KanbanWebSocketServer(bot, server);

// Запуск бота
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
