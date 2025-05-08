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
Object.defineProperty(exports, "__esModule", { value: true });
exports.walletDataToKeypair = exports.createWallets = exports.saveWallets = exports.loadWallets = exports.resolveWalletPath = void 0;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const os = __importStar(require("os"));
const web3_js_1 = require("@solana/web3.js");
const bs58 = __importStar(require("bs58"));
const uuid_1 = require("uuid");
/**
 * Resolves the full path to the wallet file
 */
function resolveWalletPath(directory, isLightningMode = false) {
    // Get project root directory (assuming we're in src/utils)
    const projectRootDir = path.resolve(__dirname, '../../');
    const configDir = path.join(projectRootDir, '.config');
    // Always use wallets.json regardless of mode
    const walletFileName = 'wallets.json';
    // If directory is explicitly specified, use it
    let fullPath;
    if (directory === 'user' || directory === 'default') {
        // Use the .config directory in the project root
        fullPath = path.join(configDir, walletFileName);
    }
    else if (directory.startsWith('/') || directory.includes(':\\')) {
        // Absolute path
        fullPath = path.join(directory, walletFileName);
    }
    else if (directory.startsWith('~')) {
        // Home directory
        fullPath = path.join(os.homedir(), directory.substring(1), walletFileName);
    }
    else {
        // Relative to current directory
        fullPath = path.join(process.cwd(), directory, walletFileName);
    }
    // Create directory if it doesn't exist
    const dir = path.dirname(fullPath);
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
    return fullPath;
}
exports.resolveWalletPath = resolveWalletPath;
/**
 * Load wallets from the specified path
 */
function loadWallets(walletPath) {
    try {
        if (!fs.existsSync(walletPath)) {
            throw new Error(`Wallet file not found at: ${walletPath}`);
        }
        const data = fs.readFileSync(walletPath, 'utf8');
        const wallets = JSON.parse(data);
        if (!Array.isArray(wallets) || wallets.length === 0) {
            throw new Error('Invalid wallet data - must be a non-empty array');
        }
        return wallets;
    }
    catch (error) {
        throw new Error(`Failed to load wallets from file: ${error.message}`);
    }
}
exports.loadWallets = loadWallets;
/**
 * Save wallets to the specified path
 */
function saveWallets(wallets, walletPath) {
    try {
        // Ensure directory exists
        const dir = path.dirname(walletPath);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        fs.writeFileSync(walletPath, JSON.stringify(wallets, null, 2));
    }
    catch (error) {
        throw new Error(`Failed to save wallets to file: ${error.message}`);
    }
}
exports.saveWallets = saveWallets;
/**
 * Create a specified number of wallets
 */
function createWallets(count, includeApiKey = false) {
    const wallets = [];
    for (let i = 0; i < count; i++) {
        const keypair = web3_js_1.Keypair.generate();
        const wallet = {
            publicKey: keypair.publicKey.toString(),
            secretKey: bs58.encode(keypair.secretKey)
        };
        if (includeApiKey) {
            // Generate a simple API key if needed
            wallet.apiKey = generateApiKey();
        }
        wallets.push(wallet);
    }
    return wallets;
}
exports.createWallets = createWallets;
/**
 * Convert WalletData to Keypair
 */
function walletDataToKeypair(wallet) {
    const secretKey = bs58.decode(wallet.secretKey);
    return web3_js_1.Keypair.fromSecretKey(secretKey);
}
exports.walletDataToKeypair = walletDataToKeypair;
/**
 * Generate a random API key
 */
function generateApiKey() {
    return (0, uuid_1.v4)().replace(/-/g, '') + (0, uuid_1.v4)().substring(0, 8);
}
