"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * Custom module alias setup for Koyn Labs
 */
const path = __importStar(require("path"));
const logger_1 = __importDefault(require("./utils/logger"));
const sleepModule = __importStar(require("./utils/sleep"));
// Register custom module handler for @utils/logger and @utils/sleep
const Module = require('module');
const originalRequire = Module.prototype.require;
// Override the require function to handle custom module paths
Module.prototype.require = function (id) {
    if (id === '@utils/logger') {
        return logger_1.default;
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
}
catch (error) {
    console.warn('Warning: module-alias package not found, skipping additional aliases.');
}
