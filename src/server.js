import 'dotenv/config';
import express from 'express';
import { createServer } from 'http';
import { KanbanBot } from './bot.js';
import { KanbanWebSocketServer } from './websocket.js';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Проверка обязательных переменных
if (!process.env.BOT_TOKEN) {
    console.error('❌ ERROR: BOT_TOKEN is required in .env file');
    process.exit(1);
}

const app = express();
const server = createServer(app);

// Serve static files
app.use(express.static(path.join(__dirname)));

// Serve main HTML
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Initialize bot and WebSocket server
const bot = new KanbanBot();
const wss = new KanbanWebSocketServer(bot, server);

// Запуск бота
bot.launch();

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`🚀 HTTP Server and WebSocket are running on port ${PORT}`);
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
