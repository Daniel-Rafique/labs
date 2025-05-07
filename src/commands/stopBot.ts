import * as fs from 'fs';
import * as path from 'path';
import { exec } from 'child_process';
import inquirer from 'inquirer';
import chalk from 'chalk';
import ora from 'ora';

interface StopBotOptions {
  force?: boolean;
  directory?: string;
}

export async function stopBotCommand(options: StopBotOptions = {}): Promise<void> {
  try {
    const { force = false } = options;
    
    // Confirm before stopping
    if (!force) {
      const confirm = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'proceed',
          message: 'Are you sure you want to stop all running bot instances?',
          default: false
        }
      ]);
      
      if (!confirm.proceed) {
        console.log(chalk.yellow('Bot stop cancelled.'));
        return;
      }
    }
    
    const spinner = ora('Finding running bot instances...').start();
    
    // Find running node processes that match bot.js
    const findCommand = process.platform === 'win32' 
      ? 'tasklist /FI "IMAGENAME eq node.exe" /FO CSV /NH' 
      : 'ps aux | grep "[n]ode.*bot.js"';
    
    exec(findCommand, (error, stdout, stderr) => {
      if (error && !stdout) {
        spinner.fail('Error finding bot processes');
        console.error(chalk.red('Error:'), error.message);
        return;
      }
      
      // Parse output to find bot.js processes
      let botProcesses: { pid: string, cmd: string }[] = [];
      
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
            exec(`wmic process where "ProcessId=${pid}" get CommandLine`, (cmdError, cmdOut) => {
              if (!cmdError && cmdOut.includes('bot.js')) {
                botProcesses.push({ pid, cmd: cmdOut.trim() });
              }
            });
          }
        }
      } else {
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
        console.log(chalk.cyan(`${i + 1}. PID: ${proc.pid}`));
        console.log(chalk.gray(`   ${proc.cmd}`));
      });
      
      inquirer.prompt([
        {
          type: 'confirm',
          name: 'killAll',
          message: `Kill all ${botProcesses.length} bot processes?`,
          default: false
        }
      ]).then(answers => {
        if (!answers.killAll) {
          console.log(chalk.yellow('Operation cancelled.'));
          return;
        }
        
        const killSpinner = ora('Stopping bot instances...').start();
        
        // Kill each process
        const killPromises = botProcesses.map(proc => {
          return new Promise<void>((resolve) => {
            const killCmd = process.platform === 'win32' 
              ? `taskkill /PID ${proc.pid} /F` 
              : `kill -9 ${proc.pid}`;
              
            exec(killCmd, (killError) => {
              if (killError) {
                console.error(chalk.red(`Failed to kill process ${proc.pid}:`, killError.message));
              } else {
                console.log(chalk.green(`Successfully stopped bot with PID ${proc.pid}`));
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
    
  } catch (error: any) {
    console.error(chalk.red(`Error stopping bot: ${error.message}`));
  }
} 