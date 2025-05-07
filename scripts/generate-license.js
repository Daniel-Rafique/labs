#!/usr/bin/env node

/**
 * License key generator for testing
 * This script generates a valid license key for the application
 */
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const os = require('os');

// Create a license object
const license = {
  key: `LABS-${crypto.randomBytes(8).toString('hex').toUpperCase()}-${Date.now().toString(36).toUpperCase()}`,
  machineIds: [],
  features: ['basic_functionality', 'volume_bot', 'comment_bot'],
  expiry: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(), // 1 year from now
  issueDate: new Date().toISOString()
};

// Convert to JSON and encode as base64
const licenseString = JSON.stringify(license, null, 2);
const licenseKey = Buffer.from(licenseString).toString('base64');

// Save to license.key file
fs.writeFileSync(path.join(process.cwd(), 'license.key'), licenseKey);

console.log('License key generated successfully:');
console.log(licenseKey);
console.log('\nJSON representation:');
console.log(licenseString);
console.log('\nSaved to license.key'); 