# Deploying Trade Publisher Server to Runflare

## Prerequisites

1. **Node.js** (v14 or higher)
2. **Runflare CLI**
3. **Runflare Account**

## Step 1: Install Runflare CLI

```bash
npm install -g @runflare/cli
```

## Step 2: Login to Runflare

```bash
runflare login
```

## Step 3: Prepare Your Project

Make sure your project structure looks like this:

```
main/
├── server-runflare.js
├── runflare.json
├── package.json
├── .env.production
├── deploy-runflare.sh
├── deploy-runflare.bat
├── data/
├── logs/
└── Includes/
    └── TradePublisherLib.mqh
```

## Step 4: Configure Runflare Settings

Edit `runflare.json` with your specific settings:

```json
{
  "name": "trade-publisher-server",
  "description": "MQL4 Trade Publisher Server",
  "version": "2.0.0",
  "runtime": "nodejs18",
  "main": "server-runflare.js",
  "env": {
    "NODE_ENV": "production",
    "WS_PORT": 4000,
    "HTTP_PORT": 4001
  },
  "ports": [4000, 4001],
  "health_check": {
    "path": "/api/health",
    "port": 4001,
    "interval": 30
  }
}
```

## Step 5: Deploy to Runflare

### Option A: Using Script (Recommended)

**Linux/Mac:**
```bash
chmod +x deploy-runflare.sh
./deploy-runflare.sh
```

**Windows:**
```batch
deploy-runflare.bat
```

### Option B: Manual Deployment

```bash
# Install dependencies
npm install --production

# Deploy to Runflare
runflare deploy
```

## Step 6: Configure  MQL4 Expert Advisor

Update  EA with the Runflare URL:

```mql4
#include <TradePublisherLib.mqh>

CTradePublisher publisher;

int OnInit()
{
    publisher.SetServerUrl("copytrade.runflare.run", 443, true);
    
    // Register publisher
    if(!publisher.RegisterPublisher(IntegerToString(AccountNumber()), true))
    {
        Print("Failed to register with Runflare server");
        return INIT_FAILED;
    }
    
    return INIT_SUCCEEDED;
}
```

## Step 7: Monitor  Deployment

### Check Deployment Status
```bash
runflare status
```

### View Logs
```bash
runflare logs
```

### View Application Info
```bash
runflare info
```

## Step 8: Test  Deployment

### Health Check
Visit: `https://copytrade.runflare.run/api/health`

### Server Status
Visit: `https://copytrade.runflare.run/api/status`

### WebSocket Test
Connect to: `wss://copytrade.runflare.run:4000`

## Environment Variables

Runflare automatically sets these environment variables:

- `PORT` - Main application port
- `NODE_ENV` - Environment (production)
- `WS_PORT` - WebSocket port (4000)
- `HTTP_PORT` - HTTP API port (4001)

## Scaling and Performance

Runflare automatically handles:
- Load balancing
- Auto-scaling based on CPU/memory usage
- Health monitoring
- SSL/TLS certificates
- CDN integration

## Troubleshooting

### Common Issues:

1. **Deployment Failed**
   ```bash
   runflare logs --tail
   ```

2. **Port Issues**
   - Ensure ports 4000 and 4001 are specified in runflare.json
   - Check if ports are available

3. **SSL/HTTPS Issues**
   - Runflare provides automatic SSL
   - Update MQL4 library to use HTTPS (port 443)

4. **Connection Timeouts**
   - Check firewall settings
   - Verify Runflare URL is correct

### Debug Commands:

```bash
# View real-time logs
runflare logs --follow

# Check resource usage
runflare metrics

# Restart application
runflare restart

# Scale application
runflare scale --instances 2
```

## Production Checklist

- [ ] Runflare CLI installed and logged in
- [ ] Project configured with runflare.json
- [ ] Environment variables set
- [ ] Health check endpoint working
- [ ] SSL/HTTPS enabled
- [ ] MQL4 library updated with Runflare URL
- [ ] Monitoring and logging configured
- [ ] Backup and recovery plan in place

## Support

For Runflare-specific issues:
- Runflare Documentation: https://docs.runflare.com
- Runflare Support: support@runflare.com

For Trade Publisher Server issues:
- Check server logs: `runflare logs`
- Monitor health endpoint: `/api/health`
- Review connection statistics: `/api/status`
```

### 10. Final Deployment Commands

```bash
# Install Runflare CLI (if not already installed)
npm install -g @runflare/cli

# Login to Runflare
runflare login

# Install dependencies
npm install --production

# Deploy to Runflare
runflare deploy

# Check deployment status
runflare status

# View logs
runflare logs --tail

# Test the deployment
curl https://copytrade.runflare.run/api/health
```

### 11. Post-Deployment Testing

```bash:Server/test-runflare.js
//+------------------------------------------------------------------+
//|                                        test-runflare.js         |
//|                           Runflare Deployment Test              |
//+------------------------------------------------------------------+

const https = require('https');
const WebSocket = require('ws');

const RUNFLARE_URL = 'copytrade.runflare.run'; // Replace with your actual URL

async function testRunflareDeployment() {
    console.log('Testing Runflare deployment...\n');
    
    // Test 1: Health Check
    console.log('1. Testing Health Check...');
    try {
        const healthResponse = await makeHttpsRequest(`https://${RUNFLARE_URL}/api/health`);
        const health = JSON.parse(healthResponse);
        console.log('✓ Health Check:', health.status);
        console.log('✓ Platform:', health.platform);
        console.log('✓ Uptime:', health.uptime, 'seconds');
    } catch (error) {
        console.log('✗ Health Check failed:', error.message);
    }
    
    // Test 2: Status Check
    console.log('\n2. Testing Status Check...');
    try {
        const statusResponse = await makeHttpsRequest(`https://${RUNFLARE_URL}/api/status`);
        const status = JSON.parse(statusResponse);
        console.log('✓ Status:', status.status);
        console.log('✓ Publishers:', status.publishers.length);
        console.log('✓ Subscribers:', status.subscribers.length);
    } catch (error) {
        console.log('✗ Status Check failed:', error.message);
    }
    
    // Test 3: WebSocket Connection
    console.log('\n3. Testing WebSocket Connection...');
    try {
        const ws = new WebSocket(`wss://${RUNFLARE_URL}:4000`);
        
        ws.on('open', () => {
            console.log('✓ WebSocket connected');
            ws.close();
        });
        
        ws.on('error', (error) => {
            console.log('✗ WebSocket failed:', error.message);
        });
        
    } catch (error) {
        console.log('✗ WebSocket test failed:', error.message);
    }
    
    // Test 4: Publisher Registration
    console.log('\n4. Testing Publisher Registration...');
    try {
        const postData = 'action=register_publisher&login_id=123456&generate_api_token=true&account_name=Test&account_company=TestBroker&account_server=TestServer';
        
        const registrationResponse = await makeHttpsPostRequest(`https://${RUNFLARE_URL}/api/trade`, postData);
        const registration = JSON.parse(registrationResponse);
        
        if (registration.status === 'succeed') {
            console.log('✓ Publisher registration successful');
            console.log('✓ API Token generated:', registration.api_token.substring(0, 8) + '...');
        } else {
            console.log('✗ Publisher registration failed:', registration.error);
        }
    } catch (error) {
        console.log('✗ Publisher registration test failed:', error.message);
    }
    
    console.log('\nRunflare deployment test completed!');
}

function makeHttpsRequest(url) {
    return new Promise((resolve, reject) => {
        https.get(url, (res) => {
            let data = '';
            res.on('data', (chunk) => data += chunk);
            res.on('end', () => resolve(data));
        }).on('error', reject);
    });
}

function makeHttpsPostRequest(url, postData) {
    return new Promise((resolve, reject) => {
        const urlObj = new URL(url);
        const options = {
            hostname: urlObj.hostname,
            port: urlObj.port || 443,
            path: urlObj.pathname,
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Content-Length': Buffer.byteLength(postData)
            }
        };
        
        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', (chunk) => data += chunk);
            res.on('end', () => resolve(data));
        });
        
        req.on('error', reject);
        req.write(postData);
        req.end();
    });
}

// Run the test
testRunflareDeployment().catch(console.error);
