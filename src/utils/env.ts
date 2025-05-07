import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';

/**
 * Update or create a .env file with the JITO setting
 * @param useJito Whether to use JITO mode (true) or Lightning mode (false)
 * @returns True if successful, false otherwise
 */
export function updateEnvJitoSetting(useJito: boolean): boolean {
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
    } else {
      // Just write the updated content
      fs.writeFileSync(envPath, newEnvContent);
    }
    
    return true;
  } catch (error) {
    console.error('Error updating .env file:', error);
    return false;
  }
}

/**
 * Get the current JITO setting from .env
 * @returns true if JITO=true, false if JITO=false or undefined
 */
export function getJitoSetting(): boolean {
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
  } catch (error) {
    console.error('Error reading .env file:', error);
    return false;
  }
} 