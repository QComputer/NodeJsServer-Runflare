//+------------------------------------------------------------------+
//|                                          server-runflare.js     |
//|                    Trade Publisher Server - Runflare Version    |
//+------------------------------------------------------------------+

const WebSocket = require('ws');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const http = require('http');
const url = require('url');
const querystring = require('querystring');

// Get ports from environment variables (Runflare sets these)
const WS_PORT = process.env.WS_PORT || process.env.PORT || 4000;
const HTTP_PORT = process.env.HTTP_PORT || (parseInt(WS_PORT) + 1);

class CopyTradeServer {
    constructor(wsPort, httpPort) {
        this.wsPort = wsPort;
        this.httpPort = httpPort;
        this.publishers = new Map();
        this.subscribers = new Map();
        this.apiTokens = new Map();
        this.tradeHistory = new Map();
        this.connectionStats = {
            totalConnections: 0,
            activePublishers: 0,
            activeSubscribers: 0,
            messagesProcessed: 0,
            tradesProcessed: 0,
            httpRequestsProcessed: 0
        };
        
        this.initializeServers();
        this.startCleanupTimer();
        this.loadPersistedData();
    }

    initializeServers() {
        // Initialize WebSocket Server
        this.initializeWebSocketServer();
        
        // Initialize HTTP Server
        this.initializeHttpServer();
    }

    initializeWebSocketServer() {
        this.wss = new WebSocket.Server({ 
            port: this.wsPort,
            perMessageDeflate: false
        });

        this.wss.on('connection', (ws, req) => {
            this.handleWebSocketConnection(ws, req);
        });

        console.log(`WebSocket Server started on port ${this.wsPort}`);
    }

    initializeHttpServer() {
        this.httpServer = http.createServer((req, res) => {
            this.handleHttpRequest(req, res);
        });

        this.httpServer.listen(this.httpPort, () => {
            console.log(`HTTP Server started on port ${this.httpPort}`);
        });
    }

    async handleHttpRequest(req, res) {
        const parsedUrl = url.parse(req.url, true);
        const pathname = parsedUrl.pathname;
        const method = req.method;

        // Set CORS headers
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

        // Handle CORS preflight
        if (method === 'OPTIONS') {
            res.writeHead(200);
            res.end();
            return;
        }

        this.connectionStats.httpRequestsProcessed++;

        try {
            switch (pathname) {
                case '/':
                    this.handleRoot(res);
                    break;
                case '/api/health':
                    this.handleHealthCheck(res);
                    break;
                case '/api/status':
                    this.handleStatusCheck(res);
                    break;
                case '/api/publishers':
                    this.handlePublishersInfo(res);
                    break;
                case '/api/history':
                    this.handleTradeHistory(res, parsedUrl.query);
                    break;
                case '/api/trade':
                    if (method === 'POST') {
                        await this.handleTradeRequest(req, res);
                    } else {
                        this.sendHttpError(res, 405, 'Method not allowed');
                    }
                    break;
                default:
                    this.sendHttpError(res, 404, 'Endpoint not found');
            }
        } catch (error) {
            console.error('HTTP request error:', error);
            this.sendHttpError(res, 500, 'Internal server error');
        }
    }

    handleRoot(res) {
        const html = `
        <!DOCTYPE html>
        <html>
        <head>
            <title>Trade Publisher Server</title>
            <style>
                body { font-family: Arial, sans-serif; margin: 40px; }
                .status { background: #e8f5e8; padding: 20px; border-radius: 5px; }
                .endpoint { background: #f0f0f0; padding: 10px; margin: 10px 0; border-radius: 3px; }
                .method { color: #0066cc; font-weight: bold; }
            </style>
        </head>
        <body>
            <h1>MQL4 Trade Publisher Server</h1>
            <div class="status">
                <h2>Server Status: Running</h2>
                <p>WebSocket Port: ${this.wsPort}</p>
                <p>HTTP Port: ${this.httpPort}</p>
                <p>Platform: Runflare</p>
                <p>Uptime: ${Math.floor(process.uptime())} seconds</p>
            </div>
            
            <h2>API Endpoints</h2>
            <div class="endpoint">
                <span class="method">GET</span> /api/health - Health check
            </div>
            <div class="endpoint">
                <span class="method">GET</span> /api/status - Server status
            </div>
            <div class="endpoint">
                <span class="method">GET</span> /api/publishers - List publishers
            </div>
            <div class="endpoint">
                <span class="method">POST</span> /api/trade - Trade operations
            </div>
            <div class="endpoint">
                <span class="method">GET</span> /api/history?publisher_login_id=ID - Trade history
            </div>
            
            <h2>WebSocket Connection</h2>
            <p>Connect to: ws://${req.headers.host.split(':')[0]}:${this.wsPort}</p>
        </body>
        </html>
        `;
        
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(html);
    }

    handleHealthCheck(res) {
        const health = {
            status: 'healthy',
            timestamp: new Date().toISOString(),
            uptime: process.uptime(),
            platform: 'Runflare',
            version: '2.0.0',
            ports: {
                websocket: this.wsPort,
                http: this.httpPort
            },
            memory: process.memoryUsage(),
            connections: {
                websocket: this.wss.clients.size,
                publishers: this.publishers.size,
                subscribers: this.subscribers.size
            }
        };

        this.sendHttpSuccess(res, health);
    }

    handleStatusCheck(res) {
        const status = {
            status: 'running',
            platform: 'Runflare',
            uptime: process.uptime(),
            statistics: this.connectionStats,
            publishers: Array.from(this.publishers.keys()),
            subscribers: Array.from(this.subscribers.keys()),
            apiTokens: this.apiTokens.size,
            memory: process.memoryUsage(),
            timestamp: new Date().toISOString()
        };

        this.sendHttpSuccess(res, status);
    }

    handlePublishersInfo(res) {
        const publishers = {};
        
        this.publishers.forEach((publisher, loginId) => {
            publishers[loginId] = {
                loginId: publisher.loginId,
                connectedAt: publisher.connectedAt,
                lastHeartbeat: publisher.lastHeartbeat,
                accountInfo: publisher.accountInfo,
                activeTrades: publisher.activeTrades,
                pendingOrders: publisher.pendingOrders,
                connectionType: 'WebSocket'
            };
        });

        this.sendHttpSuccess(res, {
            publishers: publishers,
            count: Object.keys(publishers).length
        });
    }

    handleTradeHistory(res, query) {
        const publisherLoginId = query.publisher_login_id;
        const limit = parseInt(query.limit) || 100;

        if (!publisherLoginId) {
            this.sendHttpError(res, 400, 'Missing publisher_login_id parameter');
            return;
        }

        const history = this.tradeHistory.get(publisherLoginId) || [];
        const limitedHistory = history.slice(-limit);

        this.sendHttpSuccess(res, {
            publisher_login_id: publisherLoginId,
            trades: limitedHistory,
            count: limitedHistory.length,
            total_trades: history.length
        });
    }

    async handleTradeRequest(req, res) {
        try {
            const body = await this.getRequestBody(req);
            const data = querystring.parse(body);
            const action = data.action;

            console.log(`HTTP Trade request: ${action} from ${req.connection.remoteAddress}`);

            let response;
            switch (action) {
                case 'register_publisher':
                    response = await this.handleHttpPublisherRegistration(data);
                    break;
                case 'trade_signal':
                    response = await this.handleHttpTradeSignal(data);
                    break;
                case 'heartbeat':
                    response = await this.handleHttpHeartbeat(data);
                    break;
                case 'account_info':
                    response = await this.handleHttpAccountInfo(data);
                    break;
                case 'publisher_disconnect':
                    response = await this.handleHttpPublisherDisconnect(data);
                    break;
                case 'error_log':
                    response = await this.handleHttpErrorLog(data);
                    break;
                default:
                    response = { error: 'Unknown action', status_code: 400 };
            }

            if (response.error) {
                this.sendHttpError(res, response.status_code || 400, response.error);
            } else {
                this.sendHttpSuccess(res, response);
            }

        } catch (error) {
            console.error('Trade request error:', error);
            this.sendHttpError(res, 500, 'Failed to process trade request');
        }
    }

    getRequestBody(req) {
        return new Promise((resolve, reject) => {
            let body = '';
            req.on('data', chunk => {
                body += chunk.toString();
            });
            req.on('end', () => {
                resolve(body);
            });
            req.on('error', reject);
        });
    }

    async handleHttpPublisherRegistration(data) {
        const loginId = data.login_id;
        const shouldGenerateToken = data.generate_api_token === 'true';
        let apiToken = data.api_token;

        if (!loginId) {
            return { error: 'Missing login_id', status_code: 400 };
        }

        // Check if publisher already exists
        let isNew = true;
        this.apiTokens.forEach((id, token) => {
            if (id === loginId) {
                isNew = false;
                if (!shouldGenerateToken) {
                    apiToken = token;
                }
            }
        });

        if (isNew && !shouldGenerateToken) {
            return { error: 'New publisher must request API token generation', status_code: 400 };
        }

        if (isNew || shouldGenerateToken) {
            if (apiToken && !isNew) {
                this.apiTokens.delete(apiToken);
            }
            apiToken = this.generateApiToken(loginId);
            this.apiTokens.set(apiToken, loginId);
        }

        // Store publisher info for HTTP publishers
        const publisherInfo = {
            loginId: loginId,
            apiToken: apiToken,
            connectedAt: Date.now(),
            lastHeartbeat: Date.now(),
            accountInfo: {
                name: data.account_name || '',
                company: data.account_company || '',
                server: data.account_server || ''
            },
            activeTrades: 0,
            pendingOrders: 0,
            connectionType: 'HTTP'
        };

        this.publishers.set(loginId, { ...publisherInfo, ws: null });
        this.connectionStats.activePublishers++;

        console.log(`HTTP Publisher registered: ${loginId} with token: ${apiToken.substring(0, 8)}...`);
        
        this.persistData();

        return {
            status: 'succeed',
            api_token: apiToken,
            login_id: loginId,
            message: 'Publisher registered successfully'
        };
    }

    async handleHttpTradeSignal(data) {
        const apiToken = data.api_token;
        const loginId = data.login_id;

        if (!this.validateApiToken(apiToken, loginId)) {
            return { error: 'Invalid API token', status_code: 401 };
        }

        console.log(`HTTP Trade signal from ${loginId}: ${data.global_action} ${data.symbol || ''} ${data.global_ticket || ''}`);

        // Store trade in history
        this.storeTradeHistory(loginId, data);

        // Forward to WebSocket subscribers
        this.forwardToWebSocketSubscribers(apiToken, this.formatTradeSignalMessage(data));

        this.connectionStats.tradesProcessed++;

        return {
            status: 'success',
            message: 'Trade signal processed',
            trade_id: data.global_ticket
        };
    }

    async handleHttpHeartbeat(data) {
        const apiToken = data.api_token;
        const loginId = data.login_id;

        if (!this.validateApiToken(apiToken, loginId)) {
            return { error: 'Invalid API token', status_code: 401 };
        }

        // Update publisher info
        const publisher = this.publishers.get(loginId);
        if (publisher) {
            publisher.lastHeartbeat = Date.now();
            publisher.activeTrades = parseInt(data.active_trades) || 0;
            publisher.pendingOrders = parseInt(data.pending_orders) || 0;
            publisher.accountInfo.balance = parseFloat(data.account_balance) || 0;
            publisher.accountInfo.equity = parseFloat(data.account_equity) || 0;
            publisher.accountInfo.margin = parseFloat(data.account_margin) || 0;
            publisher.accountInfo.freeMargin = parseFloat(data.account_free_margin) || 0;
        }

        return {
            status: 'success',
            message: 'PONG'
        };
    }

    async handleHttpAccountInfo(data) {
        const apiToken = data.api_token;
        const loginId = data.login_id;

        if (!this.validateApiToken(apiToken, loginId)) {
            return { error: 'Invalid API token', status_code: 401 };
        }

        const publisher = this.publishers.get(loginId);
        if (publisher) {
            publisher.accountInfo = {
                name: data.name,
                company: data.company,
                server: data.server,
                currency: data.currency,
                leverage: data.leverage,
                balance: parseFloat(data.balance),
                equity: parseFloat(data.equity),
                margin: parseFloat(data.margin),
                freeMargin: parseFloat(data.free_margin),
                updatedAt: Date.now()
            };
        }

        return {
            status: 'success',
            message: 'Account info updated'
        };
    }

    async handleHttpPublisherDisconnect(data) {
        const apiToken = data.api_token;
        const loginId = data.login_id;

        if (!this.validateApiToken(apiToken, loginId)) {
            return { error: 'Invalid API token', status_code: 401 };
        }

        this.publishers.delete(loginId);
        this.connectionStats.activePublishers--;

        console.log(`HTTP Publisher ${loginId} disconnected`);

        // Notify WebSocket subscribers
        this.notifyWebSocketSubscribersOfPublisherDisconnection(apiToken);

        return {
            status: 'success',
            message: 'Publisher disconnected'
        };
    }

    async handleHttpErrorLog(data) {
        const apiToken = data.api_token;
        const loginId = data.login_id;

        if (!this.validateApiToken(apiToken, loginId)) {
            return { error: 'Invalid API token', status_code: 401 };
        }

        const errorData = {
            timestamp: new Date().toISOString(),
            publisherAccount: data.publisher_account,
            function: data.function,
            message: data.message,
            errorCode: data.error_code,
            symbol: data.symbol,
            ticket: data.ticket
        };

        this.logError(errorData);

        return {
            status: 'success',
            message: 'Error logged'
        };
    }

    // WebSocket handling methods (from original server.js)
    handleWebSocketConnection(ws, req) {
        const clientIP = req.socket.remoteAddress;
        const connectionId = this.generateConnectionId();
        
        console.log(`WebSocket connection: ${connectionId} from ${clientIP}`);
        this.connectionStats.totalConnections++;

        ws.connectionId = connectionId;
        ws.clientIP = clientIP;
        ws.isAlive = true;
        ws.lastActivity = Date.now();
        ws.type = 'unknown';

        ws.on('pong', () => {
            ws.isAlive = true;
            ws.lastActivity = Date.now();
        });

        ws.on('message', (data) => {
            this.handleWebSocketMessage(ws, data);
        });

        ws.on('close', (code, reason) => {
            this.handleWebSocketDisconnection(ws, code, reason);
        });

        ws.on('error', (error) => {
            console.error(`WebSocket error for ${connectionId}:`, error);
        });

        // Send welcome message
        this.sendWebSocketMessage(ws, '|WELCOME|server_time=' + Date.now());
    }

    handleWebSocketMessage(ws, data) {
        try {
            const message = data.toString();
            ws.lastActivity = Date.now();
            ws.isAlive = true;
            this.connectionStats.messagesProcessed++;

            if (message === 'PING') {
                this.sendWebSocketMessage(ws, 'PONG');
                return;
            }

            if (message.startsWith('|SUBSCRIBER|')) {
                this.handleWebSocketSubscriberRegistration(ws, message);
            } else if (message.startsWith('|HEARTBEAT|')) {
                this.handleWebSocketHeartbeat(ws, message);
            } else {
                console.log(`Unknown WebSocket message from ${ws.connectionId}: ${message}`);
            }

        } catch (error) {
            console.error(`Error processing WebSocket message from ${ws.connectionId}:`, error);
            this.sendWebSocketMessage(ws, '|ERROR|Failed to process message');
        }
    }

    handleWebSocketSubscriberRegistration(ws, message) {
        const params = this.parseMessage(message);
        const loginId = params.login_id;
        const apiToken = params.api_token;

        if (!apiToken || !loginId) {
            this.sendWebSocketMessage(ws, '|ERROR|Missing API token or Login ID');
            return;
        }

        const publisherLoginId = this.apiTokens.get(apiToken);
        if (!publisherLoginId) {
            this.sendWebSocketMessage(ws, '|ERROR|Invalid API token');
            return;
        }

        ws.type = 'subscriber';
        ws.apiToken = apiToken;
        ws.publisherLoginId = publisherLoginId;
        ws.loginId = loginId;

        const subscriberKey = `${loginId}`;
        this.subscribers.set(subscriberKey, {
            ws: ws,
            apiToken: apiToken,
            publisherLoginId: publisherLoginId,
            loginId: loginId,
            connectedAt: Date.now(),
            lastActivity: Date.now(),
            tradesReceived: 0
        });

        this.connectionStats.activeSubscribers++;

        console.log(`WebSocket Subscriber ${loginId} registered for Publisher ${publisherLoginId}`);
        
        this.sendWebSocketMessage(ws, `|ACTIVATION|status=succeed|publisher=${publisherLoginId}|server_time=${Date.now()}`);
    }

    handleWebSocketHeartbeat(ws, message) {
        const params = this.parseMessage(message);
        ws.lastHeartbeat = Date.now();

        if (ws.type === 'subscriber') {
            const subscriber = this.subscribers.get(ws.loginId);
            if (subscriber) {
                subscriber.lastHeartbeat = Date.now();
            }
        }

        this.sendWebSocketMessage(ws, 'PONG');
    }

    handleWebSocketDisconnection(ws, code, reason) {
        console.log(`WebSocket ${ws.connectionId} disconnected: ${code} - ${reason}`);
        
        if (ws.type === 'subscriber' && ws.loginId) {
            const subscriberKey = `${ws.loginId}`;
            this.subscribers.delete(subscriberKey);
            this.connectionStats.activeSubscribers--;
            console.log(`WebSocket Subscriber ${ws.loginId} disconnected`);
        }
    }

    // Helper methods
    validateApiToken(apiToken, loginId) {
        if (!apiToken || !loginId) return false;
        return this.apiTokens.get(apiToken) === loginId;
    }

    generateApiToken(loginId) {
        const timestamp = Date.now();
        const random = crypto.randomBytes(16).toString('hex');
        const hash = crypto.createHash('sha256')
            .update(`${loginId}_${timestamp}_${random}`)
            .digest('hex');
        return hash.substring(0, 32);
    }

    generateConnectionId() {
        return crypto.randomBytes(8).toString('hex');
    }

    formatTradeSignalMessage(data) {
        return `|TRADE_SIGNAL|global_action=${data.global_action}|symbol=${data.symbol}|lots=${data.lots}|price=${data.price}|global_ticket=${data.global_ticket}|stop_loss=${data.stop_loss || ''}|take_profit=${data.take_profit || ''}|open_time=${data.open_time}|comment=${data.comment || ''}|magic_number=${data.magic_number || ''}`;
    }

    forwardToWebSocketSubscribers(apiToken, message) {
        let forwardedCount = 0;
        
        this.subscribers.forEach((subscriber, key) => {
            if (subscriber.apiToken === apiToken && subscriber.ws.readyState === WebSocket.OPEN) {
                this.sendWebSocketMessage(subscriber.ws, message);
                subscriber.tradesReceived++;
                forwardedCount++;
            }
        });
        
        console.log(`Trade signal forwarded to ${forwardedCount} WebSocket subscribers`);
    }

    notifyWebSocketSubscribersOfPublisherDisconnection(apiToken) {
        this.subscribers.forEach((subscriber, key) => {
            if (subscriber.apiToken === apiToken && subscriber.ws.readyState === WebSocket.OPEN) {
                this.sendWebSocketMessage(subscriber.ws, '|PUBLISHER_DISCONNECTED|');
            }
        });
    }

    storeTradeHistory(publisherLoginId, tradeData) {
        if (!this.tradeHistory.has(publisherLoginId)) {
            this.tradeHistory.set(publisherLoginId, []);
        }
        
        const history = this.tradeHistory.get(publisherLoginId);
        history.push({
            ...tradeData,
            timestamp: Date.now(),
            server_time: new Date().toISOString()
        });
        
        if (history.length > 1000) {
            history.splice(0, history.length - 1000);
        }
    }

    logError(errorData) {
        const logEntry = {
            timestamp: new Date().toISOString(),
            ...errorData
        };
        
        const logFile = path.join(__dirname, 'logs', 'error.log');
        const logLine = JSON.stringify(logEntry) + '\n';
        
        fs.appendFile(logFile, logLine, (err) => {
            if (err) {
                console.error('Failed to write error log:', err);
            }
        });
    }

    parseMessage(message) {
        const params = {};
        const parts = message.split('|');
        
        parts.forEach(part => {
            const equalIndex = part.indexOf('=');
            if (equalIndex > 0) {
                const key = part.substring(0, equalIndex);
                const value = part.substring(equalIndex + 1);
                params[key] = value;
            }
        });
        
        return params;
    }

    sendWebSocketMessage(ws, message) {
        if (ws.readyState === WebSocket.OPEN) {
            try {
                ws.send(message);
                return true;
            } catch (error) {
                console.error(`Failed to send WebSocket message:`, error);
                return false;
            }
        }
        return false;
    }

    sendHttpSuccess(res, data) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
            ...data,
            timestamp: new Date().toISOString()
        }));
    }

    sendHttpError(res, statusCode, message) {
        res.writeHead(statusCode, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
            error: message,
            status_code: statusCode,
            timestamp: new Date().toISOString()
        }));
    }

    startCleanupTimer() {
        setInterval(() => {
            this.cleanupConnections();
        }, 30000);
        
        setInterval(() => {
            this.printStatistics();
        }, 300000);
        
        setInterval(() => {
            this.persistData();
        }, 600000);
    }

    cleanupConnections() {
        const now = Date.now();
        const timeout = 120000;
        
        // Clean up HTTP publishers (check last heartbeat)
        this.publishers.forEach((publisher, loginId) => {
            if (!publisher.ws && now - publisher.lastHeartbeat > timeout) {
                console.log(`HTTP Publisher ${loginId} timed out, removing...`);
                this.publishers.delete(loginId);
                this.connectionStats.activePublishers--;
            }
        });
        
        // Clean up WebSocket subscribers
        this.subscribers.forEach((subscriber, key) => {
            if (now - subscriber.ws.lastActivity > timeout) {
                console.log(`WebSocket Subscriber ${key} timed out, removing...`);
                if (subscriber.ws.readyState === WebSocket.OPEN) {
                    subscriber.ws.terminate();
                }
                this.subscribers.delete(key);
                this.connectionStats.activeSubscribers--;
            }
        });
        
        // Ping WebSocket connections
        this.wss.clients.forEach((ws) => {
            if (ws.isAlive === false) {
                ws.terminate();
                return;
            }
            
            ws.isAlive = false;
            ws.ping();
        });
    }

    printStatistics() {
        console.log('\n=== RUNFLARE SERVER STATISTICS ===');
        console.log(`Platform: Runflare`);
        console.log(`WebSocket Port: ${this.wsPort}`);
        console.log(`HTTP Port: ${this.httpPort}`);
        console.log(`Total WebSocket Connections: ${this.connectionStats.totalConnections}`);
        console.log(`HTTP Requests Processed: ${this.connectionStats.httpRequestsProcessed}`);
        console.log(`Active Publishers: ${this.connectionStats.activePublishers}`);
        console.log(`Active Subscribers: ${this.connectionStats.activeSubscribers}`);
        console.log(`Messages Processed: ${this.connectionStats.messagesProcessed}`);
        console.log(`Trades Processed: ${this.connectionStats.tradesProcessed}`);
        console.log(`Memory Usage: ${JSON.stringify(process.memoryUsage())}`);
        console.log('===================================\n');
    }

    persistData() {
        const dataDir = path.join(__dirname, 'data');
        if (!fs.existsSync(dataDir)) {
            fs.mkdirSync(dataDir, { recursive: true });
        }
        
        const tokensFile = path.join(dataDir, 'api_tokens.json');
        const tokensData = {};
        this.apiTokens.forEach((loginId, token) => {
            tokensData[token] = loginId;
        });
        
        fs.writeFileSync(tokensFile, JSON.stringify(tokensData, null, 2));
        
        const statsFile = path.join(dataDir, 'statistics.json');
        const statsData = {
            ...this.connectionStats,
            lastUpdate: new Date().toISOString(),
            activePublishers: Array.from(this.publishers.keys()),
            activeSubscribers: Array.from(this.subscribers.keys()),
            platform: 'Runflare',
            ports: {
                websocket: this.wsPort,
                http: this.httpPort
            }
        };
        
        fs.writeFileSync(statsFile, JSON.stringify(statsData, null, 2));
    }

    loadPersistedData() {
        const dataDir = path.join(__dirname, 'data');
        const tokensFile = path.join(dataDir, 'api_tokens.json');
        
        if (fs.existsSync(tokensFile)) {
            try {
                const tokensData = JSON.parse(fs.readFileSync(tokensFile, 'utf8'));
                Object.entries(tokensData).forEach(([token, loginId]) => {
                    this.apiTokens.set(token, loginId);
                });
                console.log(`Loaded ${this.apiTokens.size} API tokens from persistence`);
            } catch (error) {
                console.error('Failed to load persisted API tokens:', error);
            }
        }
        
        const logsDir = path.join(__dirname, 'logs');
        if (!fs.existsSync(logsDir)) {
            fs.mkdirSync(logsDir, { recursive: true });
        }
    }

    shutdown() {
        console.log('Shutting down Runflare Trade Publisher Server...');
        
        this.wss.clients.forEach((ws) => {
            if (ws.readyState === WebSocket.OPEN) {
                this.sendWebSocketMessage(ws, '|SERVER_SHUTDOWN|message=Server is shutting down');
            }
        });
        
        this.persistData();
        
        this.wss.close(() => {
            console.log('WebSocket server closed');
        });
        
        this.httpServer.close(() => {
            console.log('HTTP server closed');
            process.exit(0);
        });
    }
}

// Create and start server
const server = new CopyTradeServer(WS_PORT, HTTP_PORT);

// Handle graceful shutdown
process.on('SIGINT', () => {
    server.shutdown();
});

process.on('SIGTERM', () => {
    server.shutdown();
});

process.on('uncaughtException', (error) => {
    console.error('Uncaught Exception:', error);
    server.shutdown();
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

console.log('='.repeat(50));
console.log('MQL4 Trade Publisher Server - Runflare Edition');
console.log('='.repeat(50));
console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
console.log(`WebSocket Port: ${WS_PORT}`);
console.log(`HTTP Port: ${HTTP_PORT}`);
console.log(`Process ID: ${process.pid}`);
console.log('='.repeat(50));

module.exports = CopyTradeServer;