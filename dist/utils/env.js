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
exports.getJitoSetting = exports.updateEnvJitoSetting = void 0;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const dotenv = __importStar(require("dotenv"));
/**
 * Update or create a .env file with the JITO setting
 * @param useJito Whether to use JITO mode (true) or Lightning mode (false)
 * @returns True if successful, false otherwise
 */
function updateEnvJitoSetting(useJito) {
    try {
        // Get project root directory
        const projectRootDir = path.resolve(__dirname, '../../');
        const envPath = path.join(projectRootDir, '.env');
        // Read existing .env file if it exists
        let envContent = '';
        if (fs.existsSync(envPath)) {
            envContent = fs.readFileSync(envPath, 'utf8');
        }
        // Parse existing .env content
        const envConfig = dotenv.parse(envContent);
        // Update or add JITO setting
        envConfig.JITO = useJito.toString();
        // Convert back to .env format
        const newEnvContent = Object.entries(envConfig)
            .map(([key, value]) => `${key}=${value}`)
            .join('\n');
        // If .env-template exists but .env doesn't, copy template first
        const templatePath = path.join(projectRootDir, '.env-template');
        if (!fs.existsSync(envPath) && fs.existsSync(templatePath)) {
            const templateContent = fs.readFileSync(templatePath, 'utf8');
            fs.writeFileSync(envPath, templateContent);
            // Now update the JITO setting in the newly created .env file
            envConfig.JITO = useJito.toString();
            const updatedContent = Object.entries(envConfig)
                .map(([key, value]) => `${key}=${value}`)
                .join('\n');
            fs.writeFileSync(envPath, updatedContent);
        }
        else {
            // Just write the updated content
            fs.writeFileSync(envPath, newEnvContent);
        }
        return true;
    }
    catch (error) {
        console.error('Error updating .env file:', error);
        return false;
    }
}
exports.updateEnvJitoSetting = updateEnvJitoSetting;
/**
 * Get the current JITO setting from .env
 * @returns true if JITO=true, false if JITO=false or undefined
 */
function getJitoSetting() {
    try {
        // Get project root directory
        const projectRootDir = path.resolve(__dirname, '../../');
        const envPath = path.join(projectRootDir, '.env');
        // Return false if .env doesn't exist
        if (!fs.existsSync(envPath)) {
            return false;
        }
        // Read and parse .env file
        const envContent = fs.readFileSync(envPath, 'utf8');
        const envConfig = dotenv.parse(envContent);
        // Check JITO setting
        return envConfig.JITO === 'true';
    }
    catch (error) {
        console.error('Error reading .env file:', error);
        return false;
    }
}
exports.getJitoSetting = getJitoSetting;
