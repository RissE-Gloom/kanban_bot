import { WebSocketServer } from 'ws';
import { createServer } from 'http';
import fs from 'fs';
import path from 'path';

export class KanbanWebSocketServer {
    #wss = null;
    #clients = new Set();
    #bot = null;
    #notificationChatId = null;
    #subscriptionsPath = path.resolve('subscriptions.json');
    #subscriptions = {};

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

    // Установить chatId для уведомлений
    setNotificationChatId(chatId) {
        this.#notificationChatId = chatId;
        console.log('✅ Notification chat ID set:', chatId);
    }

    getClientCount() {
        return this.#clients.size;
    }

    start(port = 8080) {
        const server = createServer((req, res) => {
            // Basic health check endpoint
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
            path: '/ws' // Явно указываем путь для WebSocket
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

        console.log(`🚀 WebSocket server started on port ${port}`);
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

            case 'COLUMN_STATUS_RESPONSE':
                this.#handleColumnStatusResponse(message);
                break;

            case 'PONG':
                console.log('🏓 Pong received from client');
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
            console.error('Invalid status response format');
            return;
        }

        if (message.chatId && this.#bot) {
            // Сохраняем актуальные данные
            if (message.labels) this._lastLabels = message.labels;
            if (message.columns) this._lastColumns = message.columns;

            if (message.reason === 'subscription') {
                this.sendLabelSelectionMenu(message.chatId);
            } else {
                this.#sendColumnSelection(message.chatId, message.columns, message.labels);
            }
        }
    }


    #handleColumnStatusResponse(message) {
        if (!message.column || !message.chatId) return;

        if (this.#bot) {
            this.#sendFormattedColumnStatus(message.chatId, message.column);
        }
    }

    // Отправляем меню выбора колонки
    #sendColumnSelection(chatId, columns, labels = []) {
        try {
            const keyboard = {
                inline_keyboard: [
                    // Кнопки для каждой колонки
                    ...columns.map(column => [{
                        text: `📂 ${column.title} (${column.taskCount})`,
                        callback_data: `status_column_${column.status}`
                    }]),
                    // Кнопки для каждой колонки
                    ...columns.map(column => [{
                        text: `📂 ${column.title} (${column.taskCount})`,
                        callback_data: `status_column_${column.status}`
                    }])
                ]
            };

            this.#bot.telegram.sendMessage(
                chatId,
                '📋 *Выберите колонку для просмотра или настройте уведомления:*',
                {
                    parse_mode: 'Markdown',
                    reply_markup: keyboard
                }
            ).catch(error => {
                console.error('Error sending column selection:', error);
            });

            // Если есть метки, сохраним их для следующего шага (в памяти или передадим через контекст)
            // Но проще всего передать их в другой метод, если нужно
            if (labels && labels.length > 0) {
                this._lastLabels = labels;
                this._lastColumns = columns;
            }

        } catch (error) {
            console.error('Error creating column selection:', error);
        }
    }

    sendLabelSelectionMenu(chatId) {
        if (!this._lastLabels) {
            this.#bot.telegram.sendMessage(chatId, '❌ Список меток пуст или еще не загружен. Попробуйте позже.');
            return;
        }

        const keyboard = {
            inline_keyboard: this._lastLabels.map(label => ([{
                text: `🏷️ ${label}`,
                callback_data: `sub_select_label_${label}`
            }]))
        };

        this.#bot.telegram.sendMessage(
            chatId,
            '🏷️ *Выберите метку для подписки:*',
            {
                parse_mode: 'Markdown',
                reply_markup: keyboard
            }
        );
    }

    sendColumnSelectionMenu(chatId, label) {
        if (!this._lastColumns) {
            this.#bot.telegram.sendMessage(chatId, '❌ Список колонок пуст или еще не загружен.');
            return;
        }

        const keyboard = {
            inline_keyboard: this._lastColumns.map(column => ([{
                text: `📂 ${column.title}`,
                callback_data: `sub_final_${label}|${column.status}`
            }]))
        };

        this.#bot.telegram.sendMessage(
            chatId,
            `📂 *Выберите колонку для метки "${label}":*`,
            {
                parse_mode: 'Markdown',
                reply_markup: keyboard
            }
        );
    }

    getColumnTitle(status) {
        return this.#getColumnName(status);
    }

    sendSubscriptionMenu(chatId) {
        // Старый метод, оставляем для совместимости или удаляем если не нужен
        this.sendLabelSelectionMenu(chatId);
    }

    #sendFormattedColumnStatus(chatId, column) {
        try {
            let message = `📦 *${column.title}*\n`;
            message += `📊 Карточек: ${column.taskCount}\n\n`;

            if (column.tasks && column.tasks.length > 0) {
                message += '*Список карточек:*\n';
                column.tasks.forEach((task, index) => {
                    const priorityEmoji = this.#getPriorityEmoji(task.priority);
                    message += `${index + 1}. ${priorityEmoji} ${task.title}`;
                    if (task.label) {
                        message += ` 🏷️${task.label}`;
                    }
                    message += '\n';
                });
            } else {
                message += '📭 Карточек нет';
            }

            this.#bot.telegram.sendMessage(
                chatId,
                message,
                { parse_mode: 'Markdown' }
            ).catch(error => {
                console.error('Error sending column status:', error);
            });

        } catch (error) {
            console.error('Error formatting column status:', error);
        }
    }

    #sendFormattedStatus(chatId, columns) {
        try {
            let statusMessage = '📊 *Статус всех колонок:*\n\n';

            columns.forEach((column, index) => {
                statusMessage += `*${index + 1}. ${column.title}* - ${column.taskCount} карточек\n`;
            });

            this.#bot.telegram.sendMessage(
                chatId,
                statusMessage,
                { parse_mode: 'Markdown' }
            ).catch(error => {
                console.error('Error sending status:', error);
            });

        } catch (error) {
            console.error('Error formatting status:', error);
        }
    }

    #getPriorityEmoji(priority) {
        const emojis = {
            'low': '🔵',
            'medium': '🟡',
            'high': '🔴'
        };
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
        if (!this.#bot || !process.env.CHAT_ID) {
            console.log('❌ Cannot send notification: bot or chat ID not set');
            return;
        }

        try {
            // Преобразуем CHAT_ID в число
            const chatId = parseInt(process.env.CHAT_ID);
            console.log('📤 Sending to chat ID:', chatId);

            const result = await this.#bot.telegram.sendMessage(chatId, message);
            console.log('✅ Notification sent successfully to chat:', chatId);

        } catch (error) {
            console.error('❌ Telegram send error:', error);
            console.error('Error details:', error.response || error.message);

            // Добавим дополнительную диагностику
            if (error.response && error.response.error_code === 400) {
                console.error('💡 Возможные причины:');
                console.error('1. Бот не добавлен в чат');
                console.error('2. Неправильный CHAT_ID');
                console.error('3. Бот заблокирован в чате');
            }
        }
    }

    #handleClose(ws) {
        this.#clients.delete(ws);
        console.log('❌ Kanban client disconnected');
    }

    #handleError(ws, error) {
        console.error('WebSocket error:', error);
        this.#clients.delete(ws);
    }

    // Запрос общего статуса
    requestStatus(chatId, reason = null) {
        const request = {
            type: 'REQUEST_STATUS',
            chatId: chatId,
            reason: reason,
            timestamp: new Date().toISOString()
        };

        this.broadcast(request);
        console.log(`📤 Status request sent to clients (Reason: ${reason})`);
    }

    // Запрос статуса конкретной колонки
    requestColumnStatus(chatId, columnStatus) {
        const request = {
            type: 'REQUEST_COLUMN_STATUS',
            chatId: chatId,
            columnStatus: columnStatus,
            timestamp: new Date().toISOString()
        };

        this.broadcast(request);
        console.log('📤 Column status request sent:', columnStatus);
    }

    broadcast(message) {
        const data = JSON.stringify(message);
        let sentCount = 0;

        this.#clients.forEach(client => {
            if (client.readyState === 1) {
                client.send(data);
                sentCount++;
            }
        });

        console.log(`📤 Broadcast to ${sentCount} clients: ${message.type}`);
    }

    stop() {
        if (this.#wss) {
            this.#wss.close();
            console.log('🛑 WebSocket server stopped');
        }
    }
}



