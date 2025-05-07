"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createToken = void 0;
const web3_js_1 = require("@solana/web3.js");
const bs58 = __importStar(require("bs58"));
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const axios_1 = __importDefault(require("axios"));
const form_data_1 = __importDefault(require("form-data"));
const wallet_1 = require("./wallet");
const logger_1 = __importDefault(require("./logger"));
// Sleep function to add delay if needed
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));
/**
 * Creates a token on Solana using pump.fun
 */
async function createToken(options) {
    try {
        // Load wallets
        const walletPath = (0, wallet_1.resolveWalletPath)('default');
        const wallets = (0, wallet_1.loadWallets)(walletPath);
        if (wallets.length < 2) {
            return {
                success: false,
                error: 'Need at least 2 wallets (1 creator + 1 buyer)'
            };
        }
        if (options.initialBuys > wallets.length - 1) {
            return {
                success: false,
                error: `Cannot perform ${options.initialBuys} buys with only ${wallets.length - 1} available wallets`
            };
        }
        // Select creator wallet
        const creatorWallet = wallets[options.creatorWalletIndex];
        const creatorKeypair = (0, wallet_1.walletDataToKeypair)(creatorWallet);
        // Verify logo file exists
        const logoPath = path.resolve(options.logoPath);
        if (!fs.existsSync(logoPath)) {
            return {
                success: false,
                error: `Logo file not found: ${logoPath}`
            };
        }
        // Connect to Solana
        const connectionUrl = process.env.RPC_URL || 'https://api.mainnet-beta.solana.com';
        const connection = new web3_js_1.Connection(connectionUrl, 'confirmed');
        // Check creator wallet balance
        const creatorBalance = await connection.getBalance(creatorKeypair.publicKey);
        if (creatorBalance < 0.05 * 1e9) {
            return {
                success: false,
                error: `Creator wallet has insufficient balance: ${creatorBalance / 1e9} SOL (need at least 0.05 SOL)`
            };
        }
        // Prepare token metadata
        const metadata = {
            name: options.tokenName,
            symbol: options.tokenSymbol,
            description: options.description
        };
        if (options.twitter)
            metadata.twitter = options.twitter;
        if (options.telegram)
            metadata.telegram = options.telegram;
        if (options.website)
            metadata.website = options.website;
        // Create form data for the API request
        const formData = new form_data_1.default();
        formData.append('name', metadata.name);
        formData.append('symbol', metadata.symbol);
        formData.append('description', metadata.description);
        if (metadata.twitter)
            formData.append('twitter', metadata.twitter);
        if (metadata.telegram)
            formData.append('telegram', metadata.telegram);
        if (metadata.website)
            formData.append('website', metadata.website);
        formData.append('showName', 'true');
        // Add logo file
        formData.append('file', fs.createReadStream(logoPath), {
            filename: path.basename(logoPath),
            contentType: path.extname(logoPath).toLowerCase() === '.png' ? 'image/png' : 'image/jpeg'
        });
        logger_1.default.info(`Creating token with name: ${metadata.name}, symbol: ${metadata.symbol}`);
        // Upload metadata to IPFS
        logger_1.default.info('Uploading metadata to IPFS...');
        const metadataResponse = await axios_1.default.post('https://pump.fun/api/ipfs', formData, {
            headers: formData.getHeaders()
        });
        if (!metadataResponse.data.metadataUri) {
            return {
                success: false,
                error: 'Failed to upload metadata to IPFS'
            };
        }
        const metadataUri = metadataResponse.data.metadataUri;
        logger_1.default.info(`Metadata URI: ${metadataUri}`);
        // Generate mint keypair
        const mintKeypair = web3_js_1.Keypair.generate();
        logger_1.default.info(`Generated mint address: ${mintKeypair.publicKey.toString()}`);
        // Prepare transaction for token creation
        const bundledTxArgs = [
            {
                publicKey: creatorKeypair.publicKey.toString(),
                action: "create",
                tokenMetadata: {
                    name: metadata.name,
                    symbol: metadata.symbol,
                    uri: metadataUri
                },
                mint: mintKeypair.publicKey.toString(),
                denominatedInSol: "true",
                amount: 0.01,
                slippage: 10,
                priorityFee: 0.05,
                pool: "pump"
            }
        ];
        // Add buy transactions if requested
        for (let i = 0; i < options.initialBuys; i++) {
            // Skip the creator wallet
            const buyerIndex = i + 1 >= options.creatorWalletIndex ? i + 2 : i + 1;
            if (buyerIndex >= wallets.length) {
                logger_1.default.warn(`Not enough wallets for buy #${i + 1}. Skipping remaining buys.`);
                break;
            }
            const buyerWallet = wallets[buyerIndex];
            const buyerKeypair = (0, wallet_1.walletDataToKeypair)(buyerWallet);
            // Check buyer wallet balance
            const buyerBalance = await connection.getBalance(buyerKeypair.publicKey);
            if (buyerBalance < 0.25 * 1e9) {
                logger_1.default.warn(`Buyer wallet ${buyerKeypair.publicKey.toString()} has insufficient balance (${buyerBalance / 1e9} SOL). Skipping.`);
                continue;
            }
            // Add buyer transaction
            bundledTxArgs.push({
                publicKey: buyerKeypair.publicKey.toString(),
                action: "buy",
                mint: mintKeypair.publicKey.toString(),
                denominatedInSol: "true",
                amount: parseFloat((0.2 + Math.random() * 0.05).toFixed(4)),
                slippage: 10,
                priorityFee: 0.01,
                pool: "pump"
            });
        }
        // Request transactions for token creation and buys
        logger_1.default.info(`Requesting trade transactions for ${bundledTxArgs.length} operations...`);
        const response = await axios_1.default.post('https://pumpportal.fun/api/trade-local', {
            headers: {
                "Content-Type": "application/json"
            },
            data: bundledTxArgs
        });
        if (!response.data || response.data.length === 0) {
            return {
                success: false,
                error: 'Failed to generate transactions'
            };
        }
        const transactions = response.data;
        const encodedSignedTransactions = [];
        const signatures = [];
        logger_1.default.info(`Received ${transactions.length} transactions to sign`);
        // Sign all transactions
        for (let i = 0; i < transactions.length; i++) {
            const tx = web3_js_1.VersionedTransaction.deserialize(new Uint8Array(bs58.decode(transactions[i])));
            if (i === 0) {
                // Creation transaction needs to be signed by mint and creator keypairs
                logger_1.default.info(`Signing creation transaction for mint: ${mintKeypair.publicKey.toString()}`);
                tx.sign([mintKeypair, creatorKeypair]);
            }
            else {
                // Use specific keypair for each transaction
                const buyerIndex = i; // Adjusted to use correct index for the buyer
                const buyerWallet = wallets[buyerIndex];
                const buyerKeypair = (0, wallet_1.walletDataToKeypair)(buyerWallet);
                logger_1.default.info(`Signing transaction ${i} with signer ${buyerIndex}: ${buyerKeypair.publicKey.toString()}`);
                tx.sign([buyerKeypair]);
            }
            encodedSignedTransactions.push(bs58.encode(tx.serialize()));
            signatures.push(bs58.encode(tx.signatures[0]));
        }
        // Try to submit bundle to Jito MEV
        let jitoSuccess = false;
        try {
            logger_1.default.info(`Submitting ${encodedSignedTransactions.length} transactions to Jito MEV...`);
            const jitoResponse = await axios_1.default.post('https://mainnet.block-engine.jito.wtf/api/v1/bundles', {
                "jsonrpc": "2.0",
                "id": 1,
                "method": "sendBundle",
                "params": [
                    encodedSignedTransactions
                ]
            }, {
                headers: {
                    "Content-Type": "application/json"
                }
            });
            if (jitoResponse.data.result) {
                logger_1.default.info(`Jito bundle uuid: ${jitoResponse.data.result}`);
                jitoSuccess = true;
            }
            else if (jitoResponse.data.error) {
                logger_1.default.error(`Jito bundle error: ${JSON.stringify(jitoResponse.data.error)}`);
            }
        }
        catch (e) {
            logger_1.default.error(`Error submitting to Jito MEV: ${e.message}`);
        }
        // If Jito submission failed, try direct transaction submission
        if (!jitoSuccess) {
            logger_1.default.info("Jito bundle submission failed or had errors. Trying direct RPC submission...");
            // Submit creation transaction first and wait for confirmation
            try {
                logger_1.default.info("Submitting token creation transaction directly...");
                const creationTx = encodedSignedTransactions[0];
                const signature = await connection.sendRawTransaction(bs58.decode(creationTx), { skipPreflight: true, maxRetries: 5 });
                logger_1.default.info(`Creation transaction submitted: https://solscan.io/tx/${signature}`);
                logger_1.default.info("Waiting for confirmation...");
                const confirmation = await connection.confirmTransaction(signature, 'confirmed');
                if (confirmation.value.err) {
                    logger_1.default.error(`Creation transaction failed: ${JSON.stringify(confirmation.value.err)}`);
                }
                else {
                    logger_1.default.info("Creation transaction confirmed!");
                    // Submit buy transactions with delay between them
                    for (let i = 1; i < encodedSignedTransactions.length; i++) {
                        try {
                            logger_1.default.info(`Submitting buy transaction ${i}...`);
                            const buySignature = await connection.sendRawTransaction(bs58.decode(encodedSignedTransactions[i]), { skipPreflight: true, maxRetries: 3 });
                            logger_1.default.info(`Buy transaction ${i} submitted: https://solscan.io/tx/${buySignature}`);
                            // Add delay between transactions to avoid rate limits
                            await sleep(1000);
                        }
                        catch (error) {
                            logger_1.default.error(`Error submitting buy transaction ${i}: ${error.message}`);
                        }
                    }
                }
            }
            catch (error) {
                logger_1.default.error(`Error submitting creation transaction: ${error.message}`);
                return {
                    success: false,
                    error: `Error submitting creation transaction: ${error.message}`
                };
            }
        }
        // Print transaction summary
        logger_1.default.info("\n====== Transaction Summary ======");
        for (let i = 0; i < signatures.length; i++) {
            logger_1.default.info(`Transaction ${i}: https://solscan.io/tx/${signatures[i]}`);
        }
        return {
            success: true,
            mintAddress: mintKeypair.publicKey.toString()
        };
    }
    catch (error) {
        logger_1.default.error('Token creation error:', error);
        return {
            success: false,
            error: error.message || 'Unknown error during token creation'
        };
    }
}
exports.createToken = createToken;
