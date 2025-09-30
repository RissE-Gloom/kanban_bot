import { Telegraf } from 'telegraf';
import { KanbanWebSocketServer } from './websocket.js';

export class KanbanBot {
    #bot = null;
    #wsServer = null;
    #pendingStatusRequests = new Map();

    constructor() {
        this.#bot = new Telegraf(process.env.BOT_TOKEN);
        this.#wsServer = new KanbanWebSocketServer(this.#bot);
        this.#setupCommands();
        this.#setupCallbacks();
        this.#setupErrorHandling();
    }

    #setupCommands() {
    this.#bot.command('start', (ctx) => this.#handleStart(ctx));
    this.#bot.command('status', (ctx) => this.#handleStatus(ctx));
    this.#bot.command('help', (ctx) => this.#handleHelp(ctx));
    this.#bot.command('connections', (ctx) => this.#handleConnections(ctx));
    this.#bot.command('chatid', (ctx) => this.#handleChatId(ctx)); // Добавьте эту команду
}


handleStatusResponseReceived(chatId) {
        if (this.#pendingStatusRequests.has(chatId)) {
            console.log('✅ Status response received for chat:', chatId);
            this.#pendingStatusRequests.delete(chatId);
        }
    }

#handleChatId = (ctx) => {
    ctx.reply(`🆔 Ваш Chat ID: ${ctx.chat.id}\n\nДобавьте этот ID в .env файл как CHAT_ID=${ctx.chat.id}`);
}

    #handleSetNotifications = (ctx) => {
        this.#wsServer.setNotificationChatId(ctx.chat.id);
        ctx.reply('✅ Этот чат теперь будет получать уведомления о событиях Kanban доски');
    }

    #setupCallbacks() {
        // Обработка callback от inline клавиатуры
        this.#bot.on('callback_query', (ctx) => {
            const callbackData = ctx.callbackQuery.data;
            
            if (callbackData === 'status_all') {
                this.#handleStatusAll(ctx);
            } else if (callbackData.startsWith('status_column_')) {
                const columnStatus = callbackData.replace('status_column_', '');
                this.#handleColumnStatus(ctx, columnStatus);
            }
            
            // Ответим на callback чтобы убрать "часики"
            ctx.answerCbQuery();
        });
    }

    #handleStart = (ctx) => {
        const welcomeMessage = `
🎯 *Kanban Tracker Bot*

Я отслеживаю перемещения карточек на вашей Kanban доске и присылаю уведомления.
Для открытия мини версии сайта используйте кнопку "открыть".

*Доступные опции:*
https://necromancertasks.onrender.com/ - Сайт если бот не загружается
/help - справка по командам

*Функции доски:*
• Создание новых карточек
• Перемещение между колонками  
• Обновление карточек
        `;

        ctx.reply(welcomeMessage, { parse_mode: 'Markdown' });
    }

    #handleStatus = async (ctx) => {
        try {
            const clientCount = this.#wsServer.getClientCount();
            
            this.#wsServer.requestStatus(ctx.chat.id);

            // Таймаут на ответ
            setTimeout(() => {
                if (this.#pendingStatusRequests.has(ctx.chat.id)) {
                    ctx.telegram.editMessageText(
                        ctx.chat.id,
                        message.message_id,
                        null,
                        '⏰ *Не получен ответ от Kanban доски*\n\nПроверьте что доска открыта в браузере.',
                        { parse_mode: 'Markdown' }
                    ).catch(console.error);
                    
                    this.#pendingStatusRequests.delete(ctx.chat.id);
                }
            }, 5000);

        } catch (error) {
            console.error('Status command error:', error);
            ctx.reply('❌ Ошибка при запросе статуса');
        }
    }

    #handleStatusAll = (ctx) => {
        // Запрашиваем общий статус
        this.#wsServer.requestStatus(ctx.chat.id);
    }

    #handleColumnStatus = (ctx, columnStatus) => {
        // Запрашиваем статус конкретной колонки
        this.#wsServer.requestColumnStatus(ctx.chat.id, columnStatus);
    }

    #handleConnections = (ctx) => {
        const clientCount = this.#wsServer.getClientCount();
        const status = clientCount > 0 ? '✅' : '❌';
        
        ctx.reply(
            `${status} *Подключения:*\n\n` +
            `• Подключенных досок: ${clientCount}\n` +
            `• WebSocket порт: 8080\n` +
            `• Статус: ${clientCount > 0 ? 'Активно' : 'Нет подключений'}`,
            { parse_mode: 'Markdown' }
        );
    }

    #handleHelp = (ctx) => {
        const helpMessage = `
📋 *Доступные опции:*
https://necromancertasks.onrender.com/ - перейти напрямую на сайт (если бот не открывает)
/help - показать эту справку

*Функции доски:*
• Создание новых карточек
• Перемещение между колонками
• Обновление карточек
        `;

        ctx.reply(helpMessage, { parse_mode: 'Markdown' });
    }

    #setupErrorHandling() {
        this.#bot.catch((error, ctx) => {
            console.error('Bot error:', error);
            ctx.reply('❌ Произошла ошибка при обработке команды');
        });
    }

    startWebSocket(port = 8080) {
        this.#wsServer.start(port);
        return this;
    }

    launch() {
        this.#bot.launch();
        console.log('🤖 Telegram bot started');
        return this;
    }

    stop() {
        this.#bot.stop();
        this.#wsServer.stop();
        console.log('🛑 Bot stopped');
    }
}






