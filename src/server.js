import 'dotenv/config';
import { KanbanBot } from './bot.js';

// Проверка обязательных переменных
if (!process.env.BOT_TOKEN) {
    console.error('❌ ERROR: BOT_TOKEN is required in .env file');
    process.exit(1);
}

if (!process.env.CHAT_ID) {
    console.error('❌ ERROR: CHAT_ID is required in .env file');
    process.exit(1);
}

const bot = new KanbanBot();

// Render использует порт из process.env.PORT
const port = process.env.PORT || 8080;
bot.startWebSocket(port).launch();

console.log('🚀 Kanban Bot Server started');
console.log(`📡 WebSocket server on port ${port}`);

// Graceful shutdown
const shutdown = () => {
    console.log('\n🛑 Shutting down...');
    bot.stop();
    process.exit(0);
};

process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);
process.on('unhandledRejection', (error) => {
    console.error('Unhandled rejection:', error);
});
