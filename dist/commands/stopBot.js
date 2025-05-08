"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.stopBotCommand = void 0;
const child_process_1 = require("child_process");
const inquirer_1 = __importDefault(require("inquirer"));
const chalk_1 = __importDefault(require("chalk"));
const ora_1 = __importDefault(require("ora"));
async function stopBotCommand(options = {}) {
    try {
        const { force = false } = options;
        // Confirm before stopping
        if (!force) {
            const confirm = await inquirer_1.default.prompt([
                {
                    type: 'confirm',
                    name: 'proceed',
                    message: 'Are you sure you want to stop all running bot instances?',
                    default: false
                }
            ]);
            if (!confirm.proceed) {
                console.log(chalk_1.default.yellow('Bot stop cancelled.'));
                return;
            }
        }
        const spinner = (0, ora_1.default)('Finding running bot instances...').start();
        // Find running node processes that match bot.js
        const findCommand = process.platform === 'win32'
            ? 'tasklist /FI "IMAGENAME eq node.exe" /FO CSV /NH'
            : 'ps aux | grep "[n]ode.*bot.js"';
        (0, child_process_1.exec)(findCommand, (error, stdout, stderr) => {
            if (error && !stdout) {
                spinner.fail('Error finding bot processes');
                console.error(chalk_1.default.red('Error:'), error.message);
                return;
            }
            // Parse output to find bot.js processes
            let botProcesses = [];
            if (process.platform === 'win32') {
                // Windows CSV format parsing
                const lines = stdout.trim().split('\n');
                for (const line of lines) {
                    // Extract process info from CSV format
                    const parts = line.match(/"([^"]+)"/g);
                    if (parts && parts.length >= 2) {
                        const processName = parts[0].replace(/"/g, '');
                        const pid = parts[1].replace(/"/g, '');
                        // Now we need to check if this node process is running bot.js
                        (0, child_process_1.exec)(`wmic process where "ProcessId=${pid}" get CommandLine`, (cmdError, cmdOut) => {
                            if (!cmdError && cmdOut.includes('bot.js')) {
                                botProcesses.push({ pid, cmd: cmdOut.trim() });
                            }
                        });
                    }
                }
            }
            else {
                // Unix-like format parsing
                const lines = stdout.trim().split('\n');
                for (const line of lines) {
                    const parts = line.trim().split(/\s+/);
                    if (parts.length > 1) {
                        const pid = parts[1];
                        const cmd = line;
                        botProcesses.push({ pid, cmd });
                    }
                }
            }
            if (botProcesses.length === 0) {
                spinner.info('No running bot instances found.');
                return;
            }
            spinner.succeed(`Found ${botProcesses.length} running bot instance(s)`);
            // Show found processes and confirm kill
            botProcesses.forEach((proc, i) => {
                console.log(chalk_1.default.cyan(`${i + 1}. PID: ${proc.pid}`));
                console.log(chalk_1.default.gray(`   ${proc.cmd}`));
            });
            inquirer_1.default.prompt([
                {
                    type: 'confirm',
                    name: 'killAll',
                    message: `Kill all ${botProcesses.length} bot processes?`,
                    default: false
                }
            ]).then(answers => {
                if (!answers.killAll) {
                    console.log(chalk_1.default.yellow('Operation cancelled.'));
                    return;
                }
                const killSpinner = (0, ora_1.default)('Stopping bot instances...').start();
                // Kill each process
                const killPromises = botProcesses.map(proc => {
                    return new Promise((resolve) => {
                        const killCmd = process.platform === 'win32'
                            ? `taskkill /PID ${proc.pid} /F`
                            : `kill -9 ${proc.pid}`;
                        (0, child_process_1.exec)(killCmd, (killError) => {
                            if (killError) {
                                console.error(chalk_1.default.red(`Failed to kill process ${proc.pid}:`, killError.message));
                            }
                            else {
                                console.log(chalk_1.default.green(`Successfully stopped bot with PID ${proc.pid}`));
                            }
                            resolve();
                        });
                    });
                });
                Promise.all(killPromises).then(() => {
                    killSpinner.succeed('All bot instances stopped');
                });
            });
        });
    }
    catch (error) {
        console.error(chalk_1.default.red(`Error stopping bot: ${error.message}`));
    }
}
exports.stopBotCommand = stopBotCommand;
