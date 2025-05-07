/**
 * Example script showing how to unban a user from a Telegram group
 * 
 * To run this script: node examples/unban-telegram-user.js USER_ID [CHAT_ID]
 * 
 * Make sure your .env file contains the TELEGRAM_BOT_TOKEN and TELEGRAM_GROUP_CHAT_ID
 */

// Load environment variables
require('dotenv').config();

// Import the unban functionality
const { unbanChatMember } = require('../dist/core/services/telegram/unban');

async function unbanUser() {
  // Get the user ID from command line arguments
  const userId = process.argv[2];
  
  // Optional: specify a different chat ID, or leave empty to use the default one from .env
  const chatId = process.argv[3] || null;
  
  if (!userId) {
    console.error('Please provide a user ID as the first argument');
    console.log('Usage: node examples/unban-telegram-user.js USER_ID [CHAT_ID]');
    process.exit(1);
  }
  
  console.log(`Attempting to unban user ${userId} from chat ${chatId || 'default chat'}...`);
  
  try {
    // Call the unbanChatMember function
    const result = await unbanChatMember(userId, chatId);
    
    if (result.success) {
      console.log('Success:', result.message);
    } else {
      console.error('Failed:', result.message);
    }
  } catch (error) {
    console.error('Error:', error.message);
  }
}

// Run the unban function
unbanUser().catch(console.error); 