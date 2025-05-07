# Jito SDK Integration

This project has been updated to use Jito's Block Engine API for submitting transaction bundles. This integration provides several benefits:

- More reliable transaction submission with robust error handling
- Increased transaction confirmation speed
- Improved MEV protection for trading operations
- Bundle multiple transactions atomically

## Key Components

1. **Transaction Submission**: Enhanced with base64 encoding (Jito's preferred format)
2. **Bundle Submission**: Support for both many-to-one and one-to-many bundle types
3. **Token Transfer Bundling**: Optimized dust collection for SPL tokens
4. **Automatic Failover**: Regional endpoint support with automatic retry logic

## How It Works

The dust collection and transfer functionality now uses Jito for:

1. **Bundled SOL Transfers**: Multiple source wallets to one destination
2. **Bundled Token Transfers**: Multiple source wallets to one destination
3. **Single Transaction Priority**: Enhanced priority fee + tip for faster confirmation
4. **Regional Failover**: Automatic retry across multiple geographical endpoints

## Wallet Dust Collection

The dust collection functionality has been enhanced with Jito integration:

```bash
# Collect all dust above the specified keep amount
node dist/commands/dust.js --amount 0.01 --destination YOUR_WALLET_ADDRESS
```

This will:

1. Scan all wallets for SOL and token balances
2. Use bundled transfers for SOL from multiple source wallets
3. Use bundled transfers for tokens from multiple source wallets
4. Optionally sell collected tokens via PumpFun or Jupiter

## Wallet-to-Wallet Transfers

Individual transfers now use Jito's sendTransaction API with proper tip and priority fee:

```bash
# Transfer SOL or tokens from one wallet to another
node dist/commands/transfer.js --amount 0.1
```

This will:
1. Guide you through selecting source and destination wallets
2. Use Jito for faster transaction processing
3. Automatically add proper priority fees and tips 
4. Handle bundles for one-to-many transfers

## Configuration

The following settings can be customized in `src/constants/jito.ts`:

- `JITO_BUNDLE_ENDPOINTS`: Regional endpoints for bundle submission
- `JITO_TRANSACTION_ENDPOINTS`: Regional endpoints for transaction submission
- `JITO_TIP_ACCOUNTS`: Jito's tip accounts (used for MEV extraction)
- `JITO_MIN_TIP_LAMPORTS`: Minimum tip amount (default: 10,000 lamports, 0.00001 SOL)
- `JITO_PRIORITY_FEE_MICROLAMPORTS`: Recommended priority fee (default: 25,000 microlamports)

## Advanced Features

### Bundle Types

The integration supports multiple bundle types:

1. **Many-to-One Bundle**: Transfer SOL from multiple wallets to one destination
   ```typescript
   const bundleId = await sendBundleFromMultipleWallets(
     connection,
     sourceWallets, // Array of Keypairs
     destinationWallet, // Public Key
     amounts // Array of lamport amounts
   );
   ```

2. **One-to-Many Bundle**: Transfer SOL from one wallet to multiple destinations
   ```typescript
   const bundleId = await sendBundleToMultipleWallets(
     connection,
     sourceWallet, // Keypair
     destinationWallets, // Array of Public Keys
     amounts // Array of lamport amounts
   );
   ```

3. **Token Transfer Bundle**: Transfer tokens from multiple wallets to one destination
   ```typescript
   const result = await bundleTokenTransfersFromSubwallets(
     connection,
     sourceWallets, // Array of Keypairs
     destinationWallet, // Public Key
     tokenMints, // Array of token mints
     amounts // Array of token amounts
   );
   ```

### Single Transaction Optimization

For single transactions, use the `sendTransactionViaJito` function:

```typescript
const signature = await sendTransactionViaJito(
  connection,
  transaction,
  [sourceKeypair],
  {
    priorityFee: 25000, // Optional: microlamports priority fee
    tipAmount: 10000    // Optional: lamports tip amount
  }
);
```

This function:
1. Adds priority fee and tip automatically
2. Tries multiple regional endpoints with failover
3. Falls back to standard RPC if all Jito endpoints fail
4. Returns transaction signature on success

## Troubleshooting

Common errors and their solutions:

1. **Bundle must tip at least 10000 lamports**: The transaction doesn't include a proper tip. Make sure you're using the functions from `src/utils/transaction.ts` which automatically add tips.

2. **Transaction simulation failed**: There may be an issue with the transaction. Check your wallet balance and token availability.

3. **Bundle rejected**: The bundle may have been rejected due to slot timing or other issues. The code will automatically retry with exponential backoff.

4. **Endpoint connection error**: If one endpoint fails, the system will automatically try others. No action needed.

For more information on Jito's Block Engine, visit [Jito's Documentation](https://jito.network/docs). 