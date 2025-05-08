// Test script for bot detection avoidance utilities
const { 
  getRandomizedTradeSize,
  getRandomizedTradeDelay,
  selectWalletForTrade,
  adaptToMarketConditions,
  generateBalancedOrderPattern,
  generateConsistentSessionId
} = require('./dist/utils/botDetectionAvoidance');

console.log('===== Bot Detection Avoidance Test =====');

// Test randomized trade size
console.log('\n1. Testing randomized trade sizes:');
for (let i = 0; i < 5; i++) {
  const tradeSize = getRandomizedTradeSize(0.8, 2.3);
  console.log(`Trade size ${i+1}: ${tradeSize} SOL`);
}

// Test randomized trade delay
console.log('\n2. Testing randomized trade delays:');
for (let i = 0; i < 5; i++) {
  const delay = getRandomizedTradeDelay(40, 120);
  console.log(`Delay ${i+1}: ${Math.round(delay/1000)} seconds (${delay}ms)`);
}

// Test wallet selection
console.log('\n3. Testing wallet selection:');
const mockWallets = [
  { publicKey: 'wallet1', balance: 3.2 },
  { publicKey: 'wallet2', balance: 1.5 },
  { publicKey: 'wallet3', balance: 2.7 },
  { publicKey: 'wallet4', balance: 0.5 },
  { publicKey: 'wallet5', balance: 5.0 },
  { publicKey: 'wallet6', balance: 1.8 },
];

console.log('Random strategy:');
for (let i = 0; i < 5; i++) {
  const walletIndex = selectWalletForTrade(mockWallets, 'random');
  console.log(`Selected wallet ${i+1}: ${mockWallets[walletIndex].publicKey} (balance: ${mockWallets[walletIndex].balance})`);
}

console.log('\nSequential strategy:');
let currentIndex = 0;
for (let i = 0; i < 5; i++) {
  currentIndex = selectWalletForTrade(mockWallets, 'sequential', currentIndex);
  console.log(`Selected wallet ${i+1}: ${mockWallets[currentIndex].publicKey} (balance: ${mockWallets[currentIndex].balance})`);
}

console.log('\nWeighted strategy:');
for (let i = 0; i < 5; i++) {
  const walletIndex = selectWalletForTrade(mockWallets, 'weighted');
  console.log(`Selected wallet ${i+1}: ${mockWallets[walletIndex].publicKey} (balance: ${mockWallets[walletIndex].balance})`);
}

// Test market adaptation
console.log('\n4. Testing market condition adaptation:');
const baseParams = {
  minTradeAmount: 0.8,
  maxTradeAmount: 2.3,
  minTradeDelay: 40,
  maxTradeDelay: 120
};

const marketScenarios = [
  {
    name: 'Low volume market',
    metrics: { volume24h: 5000, priceChange24h: -1.5, liquidity: 50000, volatility: 2, isUptrend: false }
  },
  {
    name: 'High volume trending market',
    metrics: { volume24h: 100000, priceChange24h: 8.5, liquidity: 500000, volatility: 5, isUptrend: true }
  },
  {
    name: 'Highly volatile market',
    metrics: { volume24h: 80000, priceChange24h: -12, liquidity: 200000, volatility: 15, isUptrend: false }
  }
];

for (const scenario of marketScenarios) {
  console.log(`\nScenario: ${scenario.name}`);
  const adaptedParams = adaptToMarketConditions(baseParams, scenario.metrics);
  console.log(`Original params: ${JSON.stringify(baseParams)}`);
  console.log(`Adapted params: ${JSON.stringify(adaptedParams)}`);
}

// Test order pattern generation
console.log('\n5. Testing balanced order pattern:');
const pattern = generateBalancedOrderPattern(10);
console.log(`Generated pattern: ${pattern.join(', ')}`);

// Test session ID generation
console.log('\n6. Testing session ID generation:');
const walletAddresses = [
  'wallet1Address',
  'wallet1Address',  // Duplicate to verify consistency
  'wallet2Address',
  'wallet3Address',
];

for (const address of walletAddresses) {
  const sessionId = generateConsistentSessionId(address);
  console.log(`Wallet ${address}: Session ID ${sessionId}`);
}

console.log('\n===== Test Complete ====='); 