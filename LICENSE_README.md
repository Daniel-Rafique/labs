# License Verification System

## Overview
This system provides license key generation and verification for the Volume Bot application. When users make a payment through the Telegram bot, they will receive a license key that can be used to activate the application.

## License Tiers
The system supports the following license tiers based on the amount of SOL paid:

- **1 SOL**: 1 month license
- **5 SOL**: 6 months license
- **8+ SOL**: 1 year license

## Application Downloads

The application can be downloaded from the GitHub releases page:

- **Latest Release:** [https://github.com/koynlabs/volume-bot/releases/latest](https://github.com/koynlabs/volume-bot/releases/latest)

Direct download link:
- **ZIP Package:** [labs-1.0.0.zip](https://github.com/koynlabs/volume-bot/releases/download/v1.0.0/labs-1.0.0.zip)

The ZIP file contains the application for all supported platforms.

## License Status Management
The system automatically manages license key status:

- **VALID**: Active license that hasn't expired
- **INVALID**: Expired license or manually invalidated license

When a license expires, its status is automatically changed to INVALID, both:
1. At verification time (when a user tries to use an expired license)
2. Through a daily scheduled check that updates all expired licenses

## API Endpoints

### 1. License Verification
Verify a license key for a specific chat ID:

```
POST /api/verify-license
```

**Request Body:**
```json
{
  "chatId": "123456789",
  "licenseKey": "ABCD-1234-EFGH-5678",
  "timestamp": 1627846400000,
  "hash": "generated_hash_value"
}
```

**Response (Success):**
```json
{
  "valid": true,
  "message": "License key is valid",
  "expiresAt": "2023-01-01T00:00:00.000Z",
  "senderWallet": "wallet_address"
}
```

**Response (Invalid):**
```json
{
  "valid": false,
  "message": "Invalid or expired license key"
}
```

### 2. Generate Master License Key (Admin Only)
Generate a master license key for administrative purposes:

```
POST /api/generate-master-license
```

**Request Body:**
```json
{
  "adminToken": "your_admin_token",
  "durationMonths": 12
}
```

**Response:**
```json
{
  "licenseKey": "MASTER-ABCD-1234-EFGH-5678",
  "duration": "12 months",
  "expiresAt": "2023-01-01T00:00:00.000Z",
  "message": "Master license key generated successfully"
}
```

### 3. Check Expired Licenses (Admin Only)
Manually trigger a check for expired licenses:

```
POST /api/check-expired-licenses
```

**Request Body:**
```json
{
  "adminToken": "your_admin_token"
}
```

**Response:**
```json
{
  "updated": 5,
  "message": "License check completed. Updated 5 expired licenses."
}
```

## Implementation Details

1. **License Key Generation**:
   - Generated when users send the required amount of SOL
   - Uses cryptographic hashing to create unique keys
   - Formatted as `XXXX-XXXX-XXXX-XXXX` for easy reading

2. **License Storage**:
   - Stored in Firebase Firestore
   - Includes expiration date, creation date, and user wallet information
   - Tracks license status (VALID/INVALID) and updates automatically

3. **License Validation**:
   - Checks key validity and expiration date
   - Requires proper chat ID for verification
   - Automatically updates expired licenses to INVALID status

4. **Automatic Expiration Handling**:
   - Daily scheduled task checks for and updates expired licenses
   - Validation attempts on expired licenses mark them as INVALID
   - Admin API endpoint available for manual expiration checks

## Environment Variables Required
- `ENCRYPTION_KEY`: For secure hash generation
- `ADMIN_API_TOKEN`: For admin access to generate master keys
- `FIRESTORE_COLLECTION`: Firestore collection name for user data

## Security Notes
- All API requests require a hash verification
- License keys are tied to specific chat IDs
- Master key generation is restricted to admin access only
- Expired licenses are automatically invalidated 