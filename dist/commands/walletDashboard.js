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
exports.walletDashboardCommand = void 0;
const web3_js_1 = require("@solana/web3.js");
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const inquirer_1 = __importDefault(require("inquirer"));
const chalk_1 = __importDefault(require("chalk"));
const ora_1 = __importDefault(require("ora"));
const wallet_1 = require("../utils/wallet");
const connection_1 = require("../utils/connection");
const transaction_1 = require("../utils/transaction");
async function walletDashboardCommand(options) {
    try {
        // Get project root directory and set up wallet path
        const projectRootDir = path.resolve(__dirname, '../../');
        const configDir = path.join(projectRootDir, '.config');
        let walletPath = options.path;
        if (!walletPath) {
            // Always use the standard wallets.json file
            walletPath = path.join(configDir, 'wallets.json');
        }
        console.log(chalk_1.default.cyan(`Using wallet file: ${walletPath}`));
        // Load wallets
        const wallets = (0, wallet_1.loadWallets)(walletPath);
        console.log(chalk_1.default.green(`Loaded ${wallets.length} wallets`));
        // Ask if we should include token balances
        const showTokens = options.showTokens !== undefined ? options.showTokens :
            (await inquirer_1.default.prompt([{
                    type: 'confirm',
                    name: 'showTokens',
                    message: 'Show token balances?',
                    default: true
                }])).showTokens;
        // Set up connection
        const connection = await (0, connection_1.getConnection)();
        // Process wallets
        const spinner = (0, ora_1.default)('Loading wallet data...').start();
        // Summary data
        let totalSolBalance = 0;
        let totalTokenCount = 0;
        let uniqueTokens = new Set();
        let walletSummaries = [];
        // Process each wallet
        for (let i = 0; i < wallets.length; i++) {
            const wallet = wallets[i];
            spinner.text = `Processing wallet ${i + 1}/${wallets.length}: ${wallet.publicKey.substring(0, 8)}...`;
            try {
                // Get SOL balance
                const pubkey = new web3_js_1.PublicKey(wallet.publicKey);
                const balance = await connection.getBalance(pubkey);
                const solBalance = balance / 10 ** 9;
                totalSolBalance += solBalance;
                // Get token balances if requested
                let walletTokens = [];
                if (showTokens) {
                    const tokens = await (0, transaction_1.getAccountTokens)(connection, pubkey);
                    totalTokenCount += tokens.length;
                    tokens.forEach(token => {
                        uniqueTokens.add(token.mint);
                        walletTokens.push({
                            mint: token.mint,
                            amount: token.amount,
                            symbol: token.mint.substring(0, 8)
                        });
                    });
                }
                // Add to summary
                walletSummaries.push({
                    publicKey: wallet.publicKey,
                    solBalance,
                    tokenCount: walletTokens.length,
                    tokens: walletTokens
                });
            }
            catch (error) {
                console.error(chalk_1.default.red(`\nError processing wallet ${wallet.publicKey}: ${error.message}`));
            }
        }
        spinner.succeed('Wallet data loaded successfully');
        // Sort wallets by SOL balance (highest first)
        walletSummaries.sort((a, b) => b.solBalance - a.solBalance);
        // Display summary
        console.log(chalk_1.default.green('\n========== Wallet Dashboard Summary =========='));
        console.log(chalk_1.default.green(`Total Wallets: ${wallets.length}`));
        console.log(chalk_1.default.green(`Total SOL Balance: ${totalSolBalance.toFixed(6)} SOL`));
        console.log(chalk_1.default.green(`Average SOL per Wallet: ${(totalSolBalance / wallets.length).toFixed(6)} SOL`));
        if (showTokens) {
            console.log(chalk_1.default.green(`Total Token Holdings: ${totalTokenCount}`));
            console.log(chalk_1.default.green(`Unique Token Types: ${uniqueTokens.size}`));
        }
        console.log(chalk_1.default.green('\n========== Top 5 Wallets by Balance =========='));
        // Display top 5 wallets
        walletSummaries.slice(0, 5).forEach((wallet, index) => {
            console.log(chalk_1.default.cyan(`${index + 1}. ${wallet.publicKey.substring(0, 8)}... - ${wallet.solBalance.toFixed(6)} SOL`));
            if (showTokens && wallet.tokenCount > 0) {
                console.log(chalk_1.default.yellow(`   Tokens: ${wallet.tokenCount}`));
                wallet.tokens
                    .sort((a, b) => b.amount - a.amount)
                    .slice(0, 3) // Show top 3 tokens
                    .forEach(token => {
                    const symbol = token.symbol || token.mint.substring(0, 8);
                    console.log(chalk_1.default.yellow(`   - ${symbol}: ${token.amount}`));
                });
                if (wallet.tokenCount > 3) {
                    console.log(chalk_1.default.yellow(`   - and ${wallet.tokenCount - 3} more tokens...`));
                }
            }
        });
        // Wallet distribution chart (text-based)
        console.log(chalk_1.default.green('\n========== SOL Balance Distribution =========='));
        // Define balance ranges
        const ranges = [
            { min: 0, max: 0.01 },
            { min: 0.01, max: 0.1 },
            { min: 0.1, max: 0.5 },
            { min: 0.5, max: 1 },
            { min: 1, max: 5 },
            { min: 5, max: Infinity }
        ];
        // Count wallets in each range
        const distribution = ranges.map(range => {
            const count = walletSummaries.filter(w => w.solBalance >= range.min &&
                w.solBalance < range.max).length;
            const percentage = (count / wallets.length) * 100;
            return {
                range: range.max === Infinity ?
                    `${range.min}+ SOL` :
                    `${range.min}-${range.max} SOL`,
                count,
                percentage
            };
        });
        // Display distribution
        distribution.forEach(d => {
            const bar = '█'.repeat(Math.ceil(d.percentage / 5));
            console.log(chalk_1.default.cyan(`${d.range.padEnd(10)}: ${bar} ${d.count} wallets (${d.percentage.toFixed(1)}%)`));
        });
        console.log(chalk_1.default.green('\n=============================================='));
        // Ask if user wants to export to CSV
        const shouldExportCsv = options.exportCsv !== undefined ? options.exportCsv :
            (await inquirer_1.default.prompt([{
                    type: 'confirm',
                    name: 'exportCsv',
                    message: 'Export wallet data to CSV file?',
                    default: false
                }])).exportCsv;
        if (shouldExportCsv) {
            await exportWalletsToCsv(walletSummaries, showTokens, configDir);
        }
    }
    catch (error) {
        console.error(chalk_1.default.red(`Error in wallet dashboard: ${error.message}`));
    }
}
exports.walletDashboardCommand = walletDashboardCommand;
/**
 * Export wallet data to a CSV file
 */
async function exportWalletsToCsv(walletSummaries, includeTokens, configDir) {
    try {
        const spinner = (0, ora_1.default)('Exporting wallet data to CSV...').start();
        // Generate timestamp for file name
        const timestamp = new Date().toISOString().replace(/:/g, '-').replace(/\..+/, '');
        const csvFileName = `wallet_dashboard_${timestamp}.csv`;
        const csvFilePath = path.join(configDir, csvFileName);
        // Generate CSV headers
        let headers = ['Wallet Address', 'SOL Balance'];
        // Generate CSV rows
        let csvContent = walletSummaries.map(wallet => {
            let row = [
                `"${wallet.publicKey}"`,
                wallet.solBalance.toString()
            ];
            return row.join(',');
        });
        // If including tokens, add a separate CSV for token data
        if (includeTokens) {
            const tokenCsvFileName = `wallet_tokens_${timestamp}.csv`;
            const tokenCsvFilePath = path.join(configDir, tokenCsvFileName);
            // Flatten token data for CSV
            const tokenRows = [];
            tokenRows.push('"Wallet Address","Token Mint","Token Symbol","Amount"');
            walletSummaries.forEach(wallet => {
                wallet.tokens.forEach(token => {
                    tokenRows.push(`"${wallet.publicKey}","${token.mint}","${token.symbol}",${token.amount}`);
                });
            });
            // Write token CSV
            fs.writeFileSync(tokenCsvFilePath, tokenRows.join('\n'));
            spinner.text = `Exporting token data to ${tokenCsvFilePath}...`;
        }
        // Add headers to main CSV
        csvContent.unshift(headers.join(','));
        // Write the file
        fs.writeFileSync(csvFilePath, csvContent.join('\n'));
        spinner.succeed(`Wallet data exported to ${csvFilePath}`);
        if (includeTokens) {
            console.log(chalk_1.default.green(`Token data exported to a separate file in ${configDir}`));
        }
    }
    catch (error) {
        console.error(chalk_1.default.red(`Error exporting to CSV: ${error.message}`));
    }
}
