/**
 * imageUpload/index.ts
 * 
 * A TypeScript wrapper for the uploadImg.js module from pumpfun-comment-bot
 */

import * as path from 'path';
import * as fs from 'fs';
import axios from 'axios';
import FormData from 'form-data';
import chalk from 'chalk';

/**
 * Fetch an image from the img directory
 * @returns Image data and filename if found
 */
async function fetchImage(): Promise<{ data: Buffer; filename: string } | null> {
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
      console.log(chalk.yellow(`Creating img directory at ${imgDir}`));
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
      
      console.log(chalk.yellow(`No images found. Please place an image in the ${imgDir} directory.`));
      return null;
    }
    
    const files = fs.readdirSync(imgDir);

    const imageFiles = files.filter((file) =>
      imageExtensions.includes(path.extname(file).toLowerCase())
    );

    if (imageFiles.length === 0) {
      console.log(chalk.yellow(`No image found in the img folder at ${imgDir}`));
      return null;
    }
    
    if (imageFiles.length > 1) {
      console.log(chalk.yellow(
        "Multiple images found in the img folder, please only keep one image"
      ));
      return null;
    }

    const imagePath = path.join(imgDir, imageFiles[0]);
    return {
      data: fs.readFileSync(imagePath),
      filename: imageFiles[0],
    };
  } catch (error) {
    console.error(chalk.red(`Error fetching image: ${error instanceof Error ? error.message : String(error)}`));
    return null;
  }
}

/**
 * Update metadata file with image info
 * @param metadata Metadata object to save
 */
async function updateMetadataFile(metadata: any): Promise<void> {
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
    console.log(chalk.green("Metadata file updated successfully"));
  } catch (error) {
    console.error(chalk.red(`Error updating metadata file: ${error instanceof Error ? error.message : String(error)}`));
  }
}

/**
 * Upload an image to pump.fun's IPFS service
 * @param file Image file buffer
 * @param filename Image filename
 * @param authToken Authentication token
 * @returns Response from upload API
 */
async function uploadToPumpFun(
  file: Buffer, 
  filename: string, 
  authToken: string = ''
): Promise<any> {
  const PUMP_FUN_API_URL = "https://pump.fun/api/ipfs";
  const formData = new FormData();
  formData.append("file", file, filename);

  const headers: Record<string, string> = {
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

  try {
    const response = await axios.post(PUMP_FUN_API_URL, formData, {
      headers: {
        ...headers,
        ...formData.getHeaders(),
      },
    });

    return response.data;
  } catch (error: any) {
    console.error(
      chalk.red(
        `Error uploading to pump.fun: ${error.response?.data || error.message}`
      )
    );
    throw error;
  }
}

/**
 * Upload an image to pump.fun's IPFS service
 * @param authToken Optional authentication token
 * @returns The uploaded image URL or null if upload failed
 */
export async function uploadImage(authToken: string = ''): Promise<string | null> {
  try {
    const img = await fetchImage();

    if (!img) {
      console.log(chalk.yellow("No valid image found in the img folder"));
      return null;
    }

    console.log(chalk.blue(`Uploading image ${img.filename} to pump.fun IPFS...`));
    const response = await uploadToPumpFun(img.data, img.filename, authToken);
    const metadata = response.metadata;

    if (metadata && metadata.image) {
      await updateMetadataFile(metadata);
      console.log(chalk.green(`Image uploaded successfully: ${metadata.image}`));
      return metadata.image;
    } else {
      console.log(chalk.yellow("No metadata received from pump.fun"));
      return null;
    }
  } catch (error) {
    console.error(chalk.red(`Error in uploadImage function: ${error instanceof Error ? error.message : String(error)}`));
    return null;
  }
} 