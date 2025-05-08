"use strict";
/**
 * imageUpload/index.ts
 *
 * A TypeScript wrapper for the uploadImg.js module from pumpfun-comment-bot
 */
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
exports.uploadImage = void 0;
const path = __importStar(require("path"));
const fs = __importStar(require("fs"));
const axios_1 = __importDefault(require("axios"));
const form_data_1 = __importDefault(require("form-data"));
const chalk_1 = __importDefault(require("chalk"));
/**
 * Fetch an image from the img directory
 * @returns Image data and filename if found
 */
async function fetchImage() {
    try {
        const imageExtensions = [
            ".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp", ".tiff",
            ".tif", ".svg", ".ico", ".heic", ".heif", ".avif", ".jfif",
        ];
        // Get project root directory
        const projectRootDir = path.resolve(__dirname, '../../../');
        const imgDir = path.join(projectRootDir, 'img');
        // Create the img directory if it doesn't exist
        if (!fs.existsSync(imgDir)) {
            console.log(chalk_1.default.yellow(`Creating img directory at ${imgDir}`));
            fs.mkdirSync(imgDir, { recursive: true });
            // Create a README file in the directory to explain how to use it
            const readmeContent = `# Image Upload Directory

Place a single image file in this directory to use with the '--with-image' flag when posting comments.

Supported image formats:
- PNG, JPG, JPEG, GIF
- WEBP, BMP, TIFF, SVG
- ICO, HEIC, HEIF, AVIF, JFIF

Note: Only one image can be uploaded at a time. If multiple images are in this folder, the upload will fail.
`;
            fs.writeFileSync(path.join(imgDir, 'README.md'), readmeContent);
            console.log(chalk_1.default.yellow(`No images found. Please place an image in the ${imgDir} directory.`));
            return null;
        }
        const files = fs.readdirSync(imgDir);
        const imageFiles = files.filter((file) => imageExtensions.includes(path.extname(file).toLowerCase()));
        if (imageFiles.length === 0) {
            console.log(chalk_1.default.yellow(`No image found in the img folder at ${imgDir}`));
            return null;
        }
        if (imageFiles.length > 1) {
            console.log(chalk_1.default.yellow("Multiple images found in the img folder, please only keep one image"));
            return null;
        }
        const imagePath = path.join(imgDir, imageFiles[0]);
        return {
            data: fs.readFileSync(imagePath),
            filename: imageFiles[0],
        };
    }
    catch (error) {
        console.error(chalk_1.default.red(`Error fetching image: ${error instanceof Error ? error.message : String(error)}`));
        return null;
    }
}
/**
 * Update metadata file with image info
 * @param metadata Metadata object to save
 */
async function updateMetadataFile(metadata) {
    try {
        // Get project root directory
        const projectRootDir = path.resolve(__dirname, '../../../');
        const metadataPath = path.join(projectRootDir, 'metadata.json');
        let existingMetadata = {};
        if (fs.existsSync(metadataPath)) {
            const metadataContent = fs.readFileSync(metadataPath, 'utf-8');
            existingMetadata = JSON.parse(metadataContent);
        }
        const updatedMetadata = { ...existingMetadata, ...metadata };
        fs.writeFileSync(metadataPath, JSON.stringify(updatedMetadata, null, 2));
        console.log(chalk_1.default.green("Metadata file updated successfully"));
    }
    catch (error) {
        console.error(chalk_1.default.red(`Error updating metadata file: ${error instanceof Error ? error.message : String(error)}`));
    }
}
/**
 * Upload an image to pump.fun's IPFS service
 * @param file Image file buffer
 * @param filename Image filename
 * @param authToken Authentication token
 * @param proxyConfig Optional proxy configuration
 * @returns Response from upload API
 */
async function uploadToPumpFun(file, filename, authToken = '', proxyConfig) {
    const PUMP_FUN_API_URL = "https://pump.fun/api/ipfs";
    const formData = new form_data_1.default();
    formData.append("file", file, filename);
    const headers = {
        accept: "*/*",
        "accept-language": "en-US,en;q=0.9",
        origin: "https://pump.fun",
        referer: "https://pump.fun/create",
        "sec-ch-ua": '"Chromium";v="128", "Not;A=Brand";v="24", "Google Chrome";v="128"',
        "sec-ch-ua-mobile": "?0",
        "sec-ch-ua-platform": '"macOS"',
        "sec-fetch-dest": "empty",
        "sec-fetch-mode": "cors",
        "sec-fetch-site": "same-origin",
        "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
    };
    // Add auth token if provided
    if (authToken) {
        headers.Cookie = `auth_token=${authToken}`;
    }
    const requestConfig = {
        headers: {
            ...headers,
            ...formData.getHeaders(),
        }
    };
    // Add proxy configuration if provided
    if (proxyConfig && proxyConfig.httpsAgent) {
        requestConfig.httpsAgent = proxyConfig.httpsAgent;
        requestConfig.httpAgent = proxyConfig.httpsAgent;
    }
    try {
        const response = await axios_1.default.post(PUMP_FUN_API_URL, formData, requestConfig);
        return response.data;
    }
    catch (error) {
        console.error(chalk_1.default.red(`Error uploading to pump.fun: ${error.response?.data || error.message}`));
        throw error;
    }
}
/**
 * Upload an image to pump.fun's IPFS service
 * @param authToken Optional authentication token
 * @param useProxy Whether to use proxy for image upload
 * @param sessionId Optional session ID for consistent proxy usage
 * @returns The uploaded image URL or null if upload failed
 */
async function uploadImage(authToken = '', useProxy = false, sessionId) {
    try {
        const img = await fetchImage();
        if (!img) {
            console.log(chalk_1.default.yellow("No valid image found in the img folder"));
            return null;
        }
        // Get proxy configuration if needed
        let proxyConfig = undefined;
        if (useProxy) {
            try {
                // Dynamic import to avoid circular dependencies
                const { getProxyManager } = await Promise.resolve().then(() => __importStar(require('../proxyManager')));
                const proxyManager = getProxyManager();
                if (proxyManager.isEnabled()) {
                    console.log(chalk_1.default.blue(`Using proxy for image upload ${sessionId ? `(session: ${sessionId})` : ''}`));
                    proxyConfig = proxyManager.getAxiosConfig(undefined, undefined, sessionId);
                }
                else {
                    console.log(chalk_1.default.yellow("Proxy requested but not enabled. Using direct connection for image upload."));
                }
            }
            catch (e) {
                console.log(chalk_1.default.yellow(`Error setting up proxy for image upload: ${e instanceof Error ? e.message : String(e)}`));
            }
        }
        console.log(chalk_1.default.blue(`Uploading image ${img.filename} to pump.fun IPFS...`));
        const response = await uploadToPumpFun(img.data, img.filename, authToken, proxyConfig);
        const metadata = response.metadata;
        if (metadata && metadata.image) {
            await updateMetadataFile(metadata);
            console.log(chalk_1.default.green(`Image uploaded successfully: ${metadata.image}`));
            return metadata.image;
        }
        else {
            console.log(chalk_1.default.yellow("No metadata received from pump.fun"));
            return null;
        }
    }
    catch (error) {
        console.error(chalk_1.default.red(`Error in uploadImage function: ${error instanceof Error ? error.message : String(error)}`));
        return null;
    }
}
exports.uploadImage = uploadImage;
