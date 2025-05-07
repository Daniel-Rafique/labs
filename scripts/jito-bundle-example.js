/**
 * Example script demonstrating Jito bundle submission using the Jito SDK
 */

require('dotenv').config();
const fs = require('fs');
const { Connection, PublicKey, Keypair } = require('@solana/web3.js');
const { JitoJsonRpcClient } = require('jito-js-rpc');
const { JITO_API_ENDPOINT } = require('../dist/constants/jito.js');
const SolSpl = require('../dist/strategies/sol_spl/index.js');

// Set up connection to Solana network
const RPC_URL = process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';
const connection = new Connection(RPC_URL, 'confirmed');

async function runJitoExample() {
    console.log('Starting Jito bundle example...');
    
    try {
        // Load wallet from file or environment variables
        let wallet;
        if (process.env.WALLET_PATH) {
            const keyData = JSON.parse(fs.readFileSync(process.env.WALLET_PATH, 'utf-8'));
            wallet = Keypair.fromSecretKey(Uint8Array.from(keyData));
        } else if (process.env.PRIVATE_KEY) {
            wallet = Keypair.fromSecretKey(
                Uint8Array.from(process.env.PRIVATE_KEY.split(',').map(s => parseInt(s.trim())))
            );
        } else {
            // Generate a test wallet with no funds
            wallet = Keypair.generate();
        }
        
        console.log(`Using wallet: ${wallet.publicKey.toString()}`);
        
        // Create Jito client
        const jitoClient = new JitoJsonRpcClient(JITO_API_ENDPOINT, "");
        
        // Get a random tip account
        console.log('Getting random tip account from Jito...');
        const tipAccount = await jitoClient.getRandomTipAccount();
        console.log(`Tip account: ${tipAccount}`);
        
        // Create strategy instance
        const strategy = new SolSpl(connection);
        
        // Check wallet balance
        const balance = await connection.getBalance(wallet.publicKey);
        console.log(`Wallet balance: ${balance / 1e9} SOL`);
        
        if (balance < 0.001 * 1e9) {
            console.log('Wallet has insufficient balance for demonstration. Minimum 0.001 SOL required.');
            console.log('This is just a demonstration - no actual trades will be executed.');
            return;
        }
        
        // Example: Execute a Jito market making cycle (if wallet has funds)
        if (balance >= 0.01 * 1e9) {
            console.log('Wallet has sufficient funds for demo. Executing market making...');
            const result = await strategy.executeJitoMarketMaking(wallet);
            console.log('Market making result:', result);
        } else {
            console.log('Simulating without executing actual trades...');
            
            // Demonstrate preparation of a bundle
            const buyAmount = 0.001; // Very small amount for demo
            
            console.log(`Preparing a bundle with token: ${strategy.activePairs[0].token1.symbol}`);
            
            // Prepare operations for the bundle
            const operations = [
                {
                    action: 'buy',
                    mint: strategy.activePairs[0].token1.address,
                    denominatedInSol: 'true',
                    amount: buyAmount.toString(),
                    priorityFee: 0.00005
                },
                {
                    action: 'sell',
                    mint: strategy.activePairs[0].token1.address,
                    denominatedInSol: 'false',
                    amount: "100%",
                    priorityFee: 0.00001
                }
            ];
            
            // Create a bundle of keypairs (same wallet for both operations)
            const keypairs = [wallet, wallet];
            
            console.log('This is a simulation only - no transactions will be sent.');
            console.log('Bundle operations:', operations);
            
            // To execute for real, uncomment:
            // const bundleResult = await strategy.executeBundledTrades(operations, keypairs);
            // console.log('Bundle execution result:', bundleResult);
        }
        
        // Show example of how to get bundle status with the SDK
        console.log('\nExample of getting bundle status:');
        console.log('const bundleStatus = await jitoClient.getBundleStatuses([[bundleId]]);');
        console.log('This would return confirmation status, slot information, and transaction IDs.');
        
        console.log('\nExample complete!');
        
    } catch (error) {
        console.error('Error in Jito example:', error);
    }
}

// Run the example
runJitoExample().catch(console.error); 