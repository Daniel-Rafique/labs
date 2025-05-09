"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.showConfigurationError = exports.checkOptionalConfig = exports.validateRequiredConfig = void 0;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const chalk_1 = __importDefault(require("chalk"));
const dotenv_1 = __importDefault(require("dotenv"));
// Load environment variables
dotenv_1.default.config();
/**
 * Validates that all required configuration is present
 */
function validateRequiredConfig() {
    const missingItems = [];
    const result = {
        isValid: true,
        missingItems: [],
        message: 'Configuration is valid'
    };
    // Check for RPC URL
    if (!process.env.SOLANA_RPC) {
        missingItems.push('SOLANA_RPC');
    }
    // Check for secondary RPC URL (optional)
    if (!process.env.SOLANA_RPC_2) {
        missingItems.push('SOLANA_RPC_2');
    }
    // Check for OpenAI API key
    if (!process.env.OPENAI_API_KEY) {
        // Check for backward compatibility with OPENAI_KEY (which was used in some parts of the app)
        if (process.env.OPENAI_KEY) {
            // Don't report as missing if we have the alternative name
            process.env.OPENAI_API_KEY = process.env.OPENAI_API_KEY;
        }
        else {
            missingItems.push('OPENAI_API_KEY');
        }
    }
    // Check for license key (either in environment variable or file)
    const hasLicenseEnvVar = !!process.env.LICENSE_KEY;
    const licensePath = path_1.default.join(process.cwd(), 'license.key');
    const hasLicenseFile = fs_1.default.existsSync(licensePath);
    if (!hasLicenseEnvVar && !hasLicenseFile) {
        missingItems.push('LICENSE_KEY');
    }
    // If we have missing items, set isValid to false and build error message
    if (missingItems.length > 0) {
        result.isValid = false;
        result.missingItems = missingItems;
        result.message = `Missing required configuration: ${missingItems.join(', ')}`;
    }
    return result;
}
exports.validateRequiredConfig = validateRequiredConfig;
/**
 * Display a warning if any optional configuration is missing
 */
function checkOptionalConfig() {
    const missingOptional = [];
    // Check for secondary RPC URL (optional)
    if (!process.env.SOLANA_RPC_2) {
        missingOptional.push('SOLANA_RPC_2');
    }
    if (missingOptional.length > 0) {
        console.log(chalk_1.default.yellow(`⚠️ Warning: Some optional configuration is not set: ${missingOptional.join(', ')}`));
    }
}
exports.checkOptionalConfig = checkOptionalConfig;
/**
 * Shows missing configuration error with instructions
 */
function showConfigurationError(validationResult) {
    console.log(chalk_1.default.red('\n╔════════════════════════════════════════════════════════════╗'));
    console.log(chalk_1.default.red('║              CONFIGURATION SETUP                          ║'));
    console.log(chalk_1.default.red('╚════════════════════════════════════════════════════════════╝'));
    console.log(chalk_1.default.yellow('\nThe following required configuration is missing:'));
    for (const item of validationResult.missingItems) {
        console.log(chalk_1.default.yellow(`  • ${item}`));
    }
    console.log(chalk_1.default.white('\nPlease set up your configuration with these steps:'));
    if (validationResult.missingItems.includes('SOLANA_RPC')) {
        console.log(chalk_1.default.white('\n1. Set your Solana RPC URL in the .env file:'));
        console.log(chalk_1.default.cyan('   SOLANA_RPC=https://your-rpc-url.com'));
    }
    if (validationResult.missingItems.includes('OPENAI_API_KEY')) {
        console.log(chalk_1.default.white('\n2. Set your OpenAI API key in the .env file:'));
        console.log(chalk_1.default.cyan('   OPENAI_API_KEY=your-api-key'));
    }
    if (validationResult.missingItems.includes('LICENSE_KEY')) {
        console.log(chalk_1.default.white('\n3. Set your license key either:'));
        console.log(chalk_1.default.white('   - As an environment variable in .env file:'));
        console.log(chalk_1.default.cyan('     LICENSE_KEY=your-license-key'));
        console.log(chalk_1.default.white('   - Or save it to a file named license.key'));
    }
    console.log(chalk_1.default.white('\nAlternatively, run the installation script:'));
    console.log(chalk_1.default.cyan('   ./install.sh  # Linux/macOS'));
    console.log(chalk_1.default.cyan('   install.bat   # Windows'));
    console.log(chalk_1.default.white('\nFor help or to obtain a license, contact:'));
    console.log(chalk_1.default.cyan('   support@koynlabs.com\n'));
}
exports.showConfigurationError = showConfigurationError;
