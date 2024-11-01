import readline from 'node:readline';
import { promisify } from 'util';




function askPassword(prompt) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      terminal: true
    });

    rl.stdoutMuted = true;

    rl.question(prompt, (password) => {
      rl.close();
      if (password.length) {
        resolve({ password });
      } else {
        console.log('\nPlease enter your password.');
        resolve(askPassword(prompt)); // Recurse until valid password is entered
      }
    });

    rl._writeToOutput = function _writeToOutput(stringToWrite) {
      if (rl.stdoutMuted) {
        rl.output.write('*');
      } else {
        rl.output.write(stringToWrite);
      }
    };
  });
}

export default askPassword;