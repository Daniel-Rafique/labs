// Register module aliases for CommonJS modules
const path = require('path');
require('module-alias/register');
// Additional manual path resolution for specific modules
const Module = require('module');
const originalRequire = Module.prototype.require;
// Override the require function to handle custom module paths
Module.prototype.require = function (id) {
    if (id === '@utils/logger') {
        return require('./utils/logger');
    }
    if (id === '@utils/sleep') {
        return require('./utils/sleep');
    }
    if (id === '@constants/constants') {
        return require('./constants/constants');
    }
    return originalRequire.call(this, id);
};
// Register aliases relative to the current directory
require('module-alias').addAliases({
    '@utils': __dirname + '/utils',
    '@commands': __dirname + '/commands',
    '@constants': __dirname + '/constants',
    '@lib': __dirname + '/lib'
});
