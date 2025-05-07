// Register module aliases for compiled code
require('module-alias').addAliases({
  '@utils': __dirname + '/utils',
  '@commands': __dirname + '/commands',
  '@constants': __dirname + '/constants'
}); 