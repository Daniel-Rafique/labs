# Wallet Resuming Feature

This feature enhances the Solana Market Maker bot to track its progress through wallet processing and resume from the correct wallet position after restarts or crashes.

## Features Added

1. **State Persistence**
   - The bot now saves its current wallet index to a state file after processing each wallet
   - State is stored in `~/marketMaker/instances/user/{CHAT_ID}/.config/wallet_state.json`

2. **Smart Resuming**
   - On startup, the bot checks for the saved state file and resumes from the last processed wallet
   - Detailed logs show which wallet is being resumed, including the wallet address and time since last operation

3. **Retry Management**
   - The bot now tracks retry attempts for problematic wallets
   - After 10 failed attempts on the same wallet, it will automatically move to the next one
   - Prevents the bot from getting stuck in an endless loop with a single problematic wallet

4. **Graceful Shutdown Handling**
   - State is saved during graceful shutdown to ensure proper resuming
   - Works with both manual interrupts (Ctrl+C) and service manager signals (PM2)

## How It Works

1. When the bot starts, it checks for a saved state file
2. If found, it reads the last processed wallet index and resumes from there
3. As each wallet is processed, the state file is updated
4. If the bot encounters errors, it intelligently manages retries and eventually advances to the next wallet

## Benefits

- **Resilience**: Bot can recover from crashes or restarts without losing its place
- **Efficiency**: No wasted time reprocessing wallets that were already completed
- **Transparency**: Logs clearly show resuming behavior, with timestamps and wallet addresses
- **Fault Tolerance**: Automatic skipping of consistently problematic wallets

## Example Log Output

```
INFO: Using wallet file path: /home/user/marketMaker/instances/user/123456/.config/wallets.json
INFO: Using state file path: /home/user/marketMaker/instances/user/123456/.config/wallet_state.json
INFO: Resuming from saved wallet index: 3/10
INFO: Resuming with wallet: ACr8hMs...j7Kp
INFO: Last wallet operation was 45 minutes ago at 2023-04-15 14:32:45
```

## Note

The bot will verify that the saved wallet index is still valid, in case the wallet list has changed since the last run. If the index is out of range, it will reset to the first wallet. 