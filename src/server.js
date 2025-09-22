import 'dotenv/config';
import { createServer } from 'http';
import { readFile, writeFile } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { KanbanBot } from './bot.js';
import { KanbanWebSocketServer } from './websocket.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

if (!process.env.BOT_TOKEN) {
    console.error('❌ ERROR: BOT_TOKEN is required in .env file');
    process.exit(1);
}

// НОВОЕ: Файл для хранения данных
const DATA_FILE = 'data.json';

// НОВОЕ: Функции для работы с данными
async function loadAppData() {
    try {
        const data = await readFile(DATA_FILE, 'utf-8');
        return JSON.parse(data);
    } catch (error) {
        return { tasks: [], columns: [] }; // Возвращаем по умолчанию
    }
}

async function saveAppData(data) {
    await writeFile(DATA_FILE, JSON.stringify(data, null, 2));
}

const server = createServer(async (req, res) => {
    try {
        // CORS headers
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
        
        if (req.method === 'OPTIONS') {
            res.writeHead(200);
            res.end();
            return;
        }

        // НОВОЕ: API для задач
        if (req.url === '/api/tasks') {
            const data = await loadAppData();
            
            if (req.method === 'GET') {
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ tasks: data.tasks }));
                return;
            }
            
            if (req.method === 'POST') {
                try {
                    let body = '';
                    req.on('data', chunk => body += chunk);
                    req.on('end', async () => {
                        const { tasks } = JSON.parse(body);
                        data.tasks = tasks;
                        await saveAppData(data);
                        res.writeHead(200);
                        res.end(JSON.stringify({ success: true }));
                    });
                } catch (error) {
                    res.writeHead(500);
                    res.end(JSON.stringify({ error: error.message }));
                }
                return;
            }
        }

        // НОВОЕ: API для колонок
        if (req.url === '/api/columns') {
            const data = await loadAppData();
            
            if (req.method === 'GET') {
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ columns: data.columns }));
                return;
            }
            
            if (req.method === 'POST') {
                try {
                    let body = '';
                    req.on('data', chunk => body += chunk);
                    req.on('end', async () => {
                        const { columns } = JSON.parse(body);
                        data.columns = columns;
                        await saveAppData(data);
                        res.writeHead(200);
                        res.end(JSON.stringify({ success: true }));
                    });
                } catch (error) {
                    res.writeHead(500);
                    res.end(JSON.stringify({ error: error.message }));
                }
                return;
            }
        }

        // СТАРОЕ: Обслуживание статических файлов (без изменений)
        const url = req.url === '/' ? '/index.html' : req.url;
        const filePath = join(__dirname, url);
        
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

// СТАРОЕ: Создание бота и WebSocket (без изменений)
const bot = new KanbanBot();
const wss = new KanbanWebSocketServer(bot, server);

bot.launch();

console.log('🤖 Bot initialized and launched');

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`🚀 HTTP Server running on port ${PORT}`);
});

// СТАРОЕ: Graceful shutdown (без изменений)
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
