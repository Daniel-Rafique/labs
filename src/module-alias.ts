/**
 * Custom module alias setup for Koyn Labs
 */
import * as path from 'path';
import logger from './utils/logger';
import * as sleepModule from './utils/sleep';

// Register custom module handler for @utils/logger and @utils/sleep
const Module = require('module');
const originalRequire = Module.prototype.require;

// Override the require function to handle custom module paths
Module.prototype.require = function(id: string) {
  if (id === '@utils/logger') {
    return logger;
  }
  if (id === '@utils/sleep') {
    return sleepModule;
  }
  if (id === '@constants/constants') {
    return require('./constants/constants');
  }
  return originalRequire.call(this, id);
};

// Also set up module-alias for other custom imports 
try {
  const moduleAlias = require('module-alias');
  const rootPath = path.resolve(__dirname, '../');
  
  moduleAlias.addAliases({
    '@utils': path.join(rootPath, 'src/utils'),
    '@constants': path.join(rootPath, 'src/constants'),
    '@commands': path.join(rootPath, 'src/commands'),
    '@lib': path.join(rootPath, 'src/lib')
  });
} catch (error) {
  console.warn('Warning: module-alias package not found, skipping additional aliases.');
}
