import { WebSocketServer } from 'ws';
import { createServer } from 'http';
import fs from 'fs';
import path from 'path';
import { getLabels, getColumns } from './firebase.js';

export class KanbanWebSocketServer {
    #wss = null;
    #clients = new Set();
    #bot = null;
    #notificationChatId = null;
    #subscriptionsPath = path.resolve('subscriptions.json');
    #subscriptions = {};
    _lastLabels = [];
    _lastColumns = [];

    constructor(bot) {
        this.#bot = bot;
        this.#notificationChatId = process.env.CHAT_ID || null;
        this.#loadSubscriptions();
    }

    #loadSubscriptions() {
        if (fs.existsSync(this.#subscriptionsPath)) {
            try {
                this.#subscriptions = JSON.parse(fs.readFileSync(this.#subscriptionsPath, 'utf8'));
            } catch (e) {
                console.error('Error loading subscriptions:', e);
                this.#subscriptions = {};
            }
        }
    }

    #saveSubscriptions() {
        try {
            fs.writeFileSync(this.#subscriptionsPath, JSON.stringify(this.#subscriptions, null, 2));
        } catch (e) {
            console.error('Error saving subscriptions:', e);
        }
    }

    addSubscription(userId, username, label, column) {
        const key = `${label}|${column}`;
        if (!this.#subscriptions[key]) this.#subscriptions[key] = [];
        if (!this.#subscriptions[key].find(s => s.userId === userId)) {
            this.#subscriptions[key].push({ userId, username });
            this.#saveSubscriptions();
        }
    }

    setNotificationChatId(chatId) {
        this.#notificationChatId = chatId;
        console.log('✅ Notification chat ID set:', chatId);
    }

    getClientCount() {
        return this.#clients.size;
    }

    start(port = 8080) {
        const server = createServer((req, res) => {
            if (req.url === '/health') {
                res.writeHead(200);
                res.end('OK');
                return;
            }
            res.writeHead(404);
            res.end();
        });

        this.#wss = new WebSocketServer({
            server: server,
            path: '/ws'
        });

        server.listen(port, () => {
            console.log(`🚀 WebSocket server started on port ${port}`);
        });

        this.#wss.on('connection', (ws) => {
            this.#clients.add(ws);
            console.log('✅ Kanban client connected');

            ws.send(JSON.stringify({
                type: 'CONNECTION_ESTABLISHED',
                message: 'Connected to Kanban bot server'
            }));

            ws.on('message', (data) => this.#handleMessage(ws, data));
            ws.on('close', () => this.#handleClose(ws));
            ws.on('error', (error) => this.#handleError(ws, error));
        });

        return this;
    }

    #handleMessage(ws, data) {
        try {
            const message = JSON.parse(data.toString());
            console.log('📨 Received message:', message.type, message);
            this.#processMessage(message, ws);
        } catch (error) {
            console.error('Message parsing error:', error);
        }
    }

    #processMessage(message, ws) {
        switch (message.type) {
            case 'TASK_MOVED':
                this.#sendTelegramNotification(this.#formatTaskMovedMessage(message));
                break;
            case 'TASK_CREATED':
                this.#sendTelegramNotification(this.#formatTaskCreatedMessage(message));
                break;
            case 'STATUS_RESPONSE':
                this.#handleStatusResponse(message);
                break;
        }
    }

    #formatTaskMovedMessage(message) {
        const key = `${message.task.label}|${message.toStatus}`;
        const subs = this.#subscriptions[key] || [];
        const mentions = subs.map(s => `@${s.username}`).join(' ');

        return `
🔄 Перемещение карточки ${mentions ? `\n🔔 Уведомление для: ${mentions}` : ''}

📋 ${message.task.title}
🪦 Из: ${this.#getColumnName(message.fromStatus)}
🪬 В: ${this.#getColumnName(message.toStatus)}
🏷️ Метка: ${message.task.label || 'нет'}
⏰ ${new Date(message.timestamp).toLocaleString('ru-RU')}
        `;
    }

    #formatTaskCreatedMessage(message) {
        return `
➕ Новая карточка

📋 ${message.task.title}
📁 Колонка: ${this.#getColumnName(message.status)}
🏷️ Метка: ${message.task.label || 'нет'}
⏰ ${new Date(message.timestamp).toLocaleString('ru-RU')}
        `;
    }

    #handleStatusResponse(message) {
        if (!message.columns || !Array.isArray(message.columns)) {
            return;
        }
        if (message.labels) this._lastLabels = message.labels;
        if (message.columns) this._lastColumns = message.columns;
    }

    async sendLabelSelectionMenu(chatId) {
        let labels = this._lastLabels;

        if (!labels || labels.length === 0) {
            labels = await getLabels();
            this._lastLabels = labels;
        }

        if (!labels || labels.length === 0) {
            this.#bot.telegram.sendMessage(chatId, '❌ Список меток пуст. Пожалуйста, добавьте их на доске.');
            return;
        }

        const keyboard = { inline_keyboard: [] };
        for (let i = 0; i < labels.length; i += 2) {
            const row = [];
            row.push({ text: `🏷️ ${labels[i]}`, callback_data: `sub_select_label_${labels[i]}` });
            if (labels[i + 1]) {
                row.push({ text: `🏷️ ${labels[i + 1]}`, callback_data: `sub_select_label_${labels[i + 1]}` });
            }
            keyboard.inline_keyboard.push(row);
        }

        this.#bot.telegram.sendMessage(chatId, '🏷️ *Выберите метку для подписки:*', {
            parse_mode: 'Markdown',
            reply_markup: keyboard
        });
    }

    async sendColumnSelectionMenu(chatId, label) {
        let columns = this._lastColumns;
        if (!columns || columns.length === 0) {
            columns = await getColumns();
            this._lastColumns = columns;
        }

        if (!columns || columns.length === 0) {
            this.#bot.telegram.sendMessage(chatId, '❌ Список колонок пуст.');
            return;
        }

        const keyboard = {
            inline_keyboard: columns.map(column => ([{
                text: `📂 ${column.title}`,
                callback_data: `sub_final_${label}|${column.status}`
            }]))
        };

        this.#bot.telegram.sendMessage(chatId, `📂 *Выберите колонку для метки "${label}":*`, {
            parse_mode: 'Markdown',
            reply_markup: keyboard
        });
    }

    #getPriorityEmoji(priority) {
        const emojis = { 'low': '🔵', 'medium': '🟡', 'high': '🔴' };
        return emojis[priority] || '⚪';
    }

    #getColumnName(status) {
        const columnNames = {
            'todo': 'Этап клина',
            'in-progress': 'Этап перевода',
            'done': 'Этап редактуры',
            'backlog': 'Бета-рид',
            'review': 'Этап тайпа',
            'testing': 'Клин (ПТ, Баст, айдол)'
        };
        return columnNames[status] || status;
    }

    async #sendTelegramNotification(message) {
        if (!this.#bot || !process.env.CHAT_ID) return;
        try {
            const chatId = parseInt(process.env.CHAT_ID);
            await this.#bot.telegram.sendMessage(chatId, message);
        } catch (error) {
            console.error('❌ Telegram notification error:', error);
        }
    }

    #handleClose(ws) {
        this.#clients.delete(ws);
    }

    #handleError(ws, error) {
        this.#clients.delete(ws);
    }

    requestStatus(chatId, reason = null) {
        this.broadcast({
            type: 'REQUEST_STATUS',
            chatId: chatId,
            reason: reason,
            timestamp: new Date().toISOString()
        });
    }

    requestColumnStatus(chatId, columnStatus) {
        this.broadcast({
            type: 'REQUEST_COLUMN_STATUS',
            chatId: chatId,
            columnStatus: columnStatus,
            timestamp: new Date().toISOString()
        });
    }

    broadcast(message) {
        const data = JSON.stringify(message);
        this.#clients.forEach(client => {
            if (client.readyState === 1) client.send(data);
        });
    }

    stop() {
        if (this.#wss) this.#wss.close();
    }
}
