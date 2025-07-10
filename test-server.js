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