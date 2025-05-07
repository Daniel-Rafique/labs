#!/usr/bin/env node

/**
 * CLI entry point for Solana-MMarker
 * This stub ensures the packaged CLI will function correctly
 */

// Check for proper Node.js version
const requiredNodeVersion = '16.0.0';
const currentNodeVersion = process.versions.node;
const semver = currentNodeVersion.split('.');
const requiredSemver = requiredNodeVersion.split('.');

let versionError = false;
for (let i = 0; i < 3; i++) {
  const current = parseInt(semver[i] || '0', 10);
  const required = parseInt(requiredSemver[i] || '0', 10);
  if (current > required) break;
  if (current < required) {
    versionError = true;
    break;
  }
}

if (versionError) {
  console.error(
    `You are running Node.js ${currentNodeVersion}.\n` +
    `Solana-MMarker requires Node.js ${requiredNodeVersion} or higher.\n` +
    `Please update your version of Node.js.`
  );
  process.exit(1);
}

// Register module aliases
require('../dist/register-aliases');

// Load the actual application
try {
  // Try to load from the compiled source first
  require('../dist/index.js');
} catch (error) {
  try {
    // Fallback to development mode if compiled source fails
    require('../src/index.ts');
  } catch (innerError) {
    console.error(`Failed to start application: ${innerError.message}`);
    console.error('Original error:', error);
    process.exit(1);
  }
}

// Run the application
require('../dist/index'); 