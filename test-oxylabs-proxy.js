#!/usr/bin/env node

// Test script to verify Oxylabs proxy connection

const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const chalk = require('chalk');

console.log(chalk.cyan('Testing Oxylabs proxy connection for labs-volume-bot'));
console.log(chalk.gray('This script will validate proxy configuration and test connection to pump.fun'));

// First check if the proxy configuration exists
const configDir = path.join(process.cwd(), '.config');
const proxyConfigPath = path.join(configDir, 'proxies.json');

let isConfigured = false;

try {
  if (fs.existsSync(proxyConfigPath)) {
    const proxyConfig = JSON.parse(fs.readFileSync(proxyConfigPath, 'utf8'));
    
    if (Array.isArray(proxyConfig) && proxyConfig.length > 0) {
      const proxy = proxyConfig[0];
      
      if (proxy.host === 'pr.oxylabs.io' && 
          proxy.username && 
          proxy.username.startsWith('customer-') && 
          proxy.password) {
        isConfigured = true;
        console.log(chalk.green('✓ Found valid Oxylabs proxy configuration'));
      } else {
        console.log(chalk.yellow('⚠️ Found proxy configuration, but it doesn\'t appear to be a valid Oxylabs configuration'));
      }
    } else {
      console.log(chalk.yellow('⚠️ Proxy configuration file exists but contains no proxies'));
    }
  } else {
    console.log(chalk.yellow('⚠️ No proxy configuration found. Will need to set up Oxylabs proxy.'));
  }
} catch (error) {
  console.error(chalk.red(`Error reading proxy configuration: ${error.message}`));
}

// Step 1: Build the application if it hasn't been built
console.log(chalk.cyan('\nStep 1: Building the application...'));
const buildResult = spawnSync('npm', ['run', 'build'], { stdio: 'inherit' });

if (buildResult.status !== 0) {
  console.error(chalk.red('Failed to build the application. Exiting.'));
  process.exit(1);
}

// Step 2: Setup the Oxylabs proxy if not configured
if (!isConfigured) {
  console.log(chalk.cyan('\nStep 2: Setting up Oxylabs proxy...'));
  console.log(chalk.yellow('Proxy needs to be configured. You will be prompted for your Oxylabs credentials.'));
  
  const setupResult = spawnSync('node', ['dist/index.js', 'setup-proxy', '--service=oxylabs'], { 
    stdio: 'inherit',
    shell: true
  });
  
  if (setupResult.status !== 0) {
    console.error(chalk.red('Failed to set up Oxylabs proxy. Exiting.'));
    process.exit(1);
  }
} else {
  console.log(chalk.cyan('\nStep 2: Testing existing proxy configuration...'));
}

// Step 3: Test proxy connection
console.log(chalk.cyan('\nStep 3: Testing proxy connection to pump.fun...'));

const testScript = `
const { getProxyManager } = require('./dist/utils/proxyManager');
const axios = require('axios');

async function testConnection() {
  try {
    console.log('Testing proxy connection to various services...');
    
    // Test 1: Get the proxy manager
    const proxyManager = getProxyManager();
    if (!proxyManager.isEnabled()) {
      console.error('FAILED: Proxy manager is not enabled');
      process.exit(1);
    }
    
    // Test 2: Basic IP check
    console.log('\\nTest 1: Basic IP check...');
    const proxyTest = await proxyManager.testProxy();
    if (!proxyTest.success) {
      console.error('FAILED: Proxy test failed - ' + proxyTest.message);
      process.exit(1);
    }
    console.log('✓ Basic proxy test successful: ' + proxyTest.ip);
    
    // Test 3: Test pump.fun health endpoint
    console.log('\\nTest 2: Testing connection to pump.fun...');
    
    // Generate natural session params
    const sessionId = \`test-\${Math.floor(Math.random() * 1000000)}\`;
    const config = proxyManager.getAxiosConfig('US', undefined, sessionId);
    
    try {
      const pumpHealth = await axios.get('https://frontend-api-v3.pump.fun/health', config);
      console.log(\`✓ Successfully connected to pump.fun health endpoint: \${pumpHealth.status} \${pumpHealth.statusText}\`);
    } catch (pumpError) {
      console.error(\`FAILED: Could not connect to pump.fun health endpoint: \${pumpError.message}\`);
      process.exit(1);
    }
    
    // Test 4: Test multiple concurrent connections to ensure no URL encoding errors
    console.log('\\nTest 3: Testing multiple concurrent connections...');
    
    const promises = [];
    for (let i = 0; i < 5; i++) {
      const sessionId = \`concurrent-test-\${i}-\${Math.floor(Math.random() * 1000000)}\`;
      const config = proxyManager.getAxiosConfig('US', undefined, sessionId);
      
      promises.push(axios.get('https://ip.oxylabs.io/location', config)
        .then(response => {
          return { success: true, ip: response.data.ip };
        })
        .catch(error => {
          return { success: false, error: error.message };
        })
      );
    }
    
    const results = await Promise.all(promises);
    const successful = results.filter(r => r.success).length;
    
    console.log(\`Concurrent connection test results: \${successful}/5 successful\`);
    results.forEach((r, i) => {
      if (r.success) {
        console.log(\`  ✓ Connection \${i+1}: \${r.ip}\`);
      } else {
        console.log(\`  × Connection \${i+1}: \${r.error}\`);
      }
    });
    
    if (successful < 3) {
      console.error('FAILED: Too many connection failures in concurrent test');
      process.exit(1);
    }
    
    console.log('\\nAll proxy tests passed successfully!');
    
  } catch (error) {
    console.error('Error during test:', error);
    process.exit(1);
  }
}

testConnection();
`;

// Write the test script to a temporary file
const tempScriptPath = path.join(process.cwd(), 'temp-proxy-test.js');
fs.writeFileSync(tempScriptPath, testScript);

// Run the test script
const testResult = spawnSync('node', [tempScriptPath], { 
  stdio: 'inherit',
  shell: true
});

// Clean up temp file
try {
  fs.unlinkSync(tempScriptPath);
} catch (e) {}

if (testResult.status === 0) {
  console.log(chalk.green('\n✓ Oxylabs proxy is correctly configured and working with pump.fun!'));
  console.log(chalk.green('You can now use the application with proxies enabled.'));
} else {
  console.error(chalk.red('\n× Proxy test failed. Please check your Oxylabs credentials and try again.'));
  console.log(chalk.yellow('You can run "node dist/index.js setup-proxy --service=oxylabs" to reconfigure your proxy.'));
} 