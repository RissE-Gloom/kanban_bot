import { WebSocketServer } from 'ws';

export class KanbanWebSocketServer {
    #wss = null;
    #clients = new Set();
    #bot = null;
    #notificationChatId = null;

    constructor(bot, server = null) {
        this.#bot = bot;
        this.#notificationChatId = process.env.CHAT_ID || null;
        
        console.log('🔧 WebSocket Server initializing...');
        console.log('📧 Notification Chat ID:', this.#notificationChatId);
        console.log('🤖 Bot available:', !!this.#bot);
        
        if (server) {
            this.#wss = new WebSocketServer({ server });
            console.log('🚀 WebSocket server attached to HTTP server');
            this.#setupWebSocketHandlers();
        } else {
            this.start(8080);
        }
    }

    #setupWebSocketHandlers() {
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
    }

    const wss = new KanbanWebSocketServer(bot.botInstance, server); // ← Используем геттер

    async #sendTelegramNotification(message) {
    console.log('📨 Attempting to send notification...');
    console.log('🤖 Bot available:', !!this.#bot);
    console.log('📞 Telegram API available:', this.#bot ? !!this.#bot.telegram : 'No bot');
    
    if (!this.#bot || !this.#bot.telegram) {
        console.log('❌ Cannot send notification: bot or telegram API not available');
        console.log('Bot:', this.#bot ? 'Available' : 'Not available');
        console.log('Telegram API:', this.#bot && this.#bot.telegram ? 'Available' : 'Not available');
        return;
    }
    
    if (!process.env.CHAT_ID) {
        console.log('❌ CHAT_ID not set');
        return;
    }
    
    try {
        const chatId = parseInt(process.env.CHAT_ID);
        console.log('📤 Sending to chat ID:', chatId);
        
        // ПРЯМАЯ ПРОВЕРКА - пытаемся получить информацию о боте
        try {
            const botInfo = await this.#bot.telegram.getMe();
            console.log('✅ Bot info:', botInfo.username);
        } catch (botError) {
            console.error('❌ Cannot access bot API:', botError.message);
            return;
        }
        
        const result = await this.#bot.telegram.sendMessage(chatId, message);
        console.log('✅ Notification sent successfully to chat:', chatId);
        
    } catch (error) {
        console.error('❌ Telegram send error:', error.message);
        if (error.response) {
            console.error('Error code:', error.response.error_code);
            console.error('Error description:', error.response.description);
        }
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
        this.#wss = new WebSocketServer({ port });
        
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
        return `
🔄 Перемещение карточки

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
            this.#sendColumnSelection(message.chatId, message.columns);
        }
    }

    #handleColumnStatusResponse(message) {
        if (!message.column || !message.chatId) return;

        if (this.#bot) {
            this.#sendFormattedColumnStatus(message.chatId, message.column);
        }
    }

    // Отправляем меню выбора колонки
    #sendColumnSelection(chatId, columns) {
        try {
            const keyboard = {
                inline_keyboard: [
                    // Кнопки для каждой колонки
                    ...columns.map(column => [{
                        text: `📂 ${column.title} (${column.taskCount})`,
                        callback_data: `status_column_${column.status}`
                    }])
                ]
            };

            this.#bot.telegram.sendMessage(
                chatId,
                '📋 *Выберите колонку для просмотра:*',
                {
                    parse_mode: 'Markdown',
                    reply_markup: keyboard
                }
            ).catch(error => {
                console.error('Error sending column selection:', error);
            });

        } catch (error) {
            console.error('Error creating column selection:', error);
        }
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

            message += '\n🔄 Используйте /status для обновления';

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

            statusMessage += '\n🔄 Используйте /status для обновления';

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
            'Cleaning stage': 'Этап клина',
            'Translator stage': 'Этап перевода', 
            'Editing stage': 'Этап редактуры',
            'Beta editing': 'Бета-рид',
            'Type stage': 'Этап тайпа',
            'Cleaning is optional': 'Клин (ПТ, Баст, айдол)'
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
    requestStatus(chatId) {
        const request = {
            type: 'REQUEST_STATUS',
            chatId: chatId,
            timestamp: new Date().toISOString()
        };

        this.broadcast(request);
        console.log('📤 Status request sent to clients');
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



