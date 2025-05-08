#!/bin/bash

# Create logs directory if it doesn't exist
mkdir -p logs

# Set NODE_ENV to production to avoid development-specific issues
export NODE_ENV=production

# Run the bot with enhanced error handling and debugging
echo "Starting trading bot with enhanced logging and error handling..."
node dist/runBot.js

# If the process exits quickly, keep the terminal open to see errors
echo "Bot process has exited. Check logs directory for detailed logs."
echo "Press any key to close this window..."
read -n 1 