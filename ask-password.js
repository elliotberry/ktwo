
import inquirer from 'inquirer';
import AWS from 'aws-sdk';
const s3 = new AWS.S3();

function askPassword(prompt) {
  const questions = [
    {
      name: 'password',
      type: 'password',
      message: prompt,
      validate: function(value) {
        if (value.length) {
          return true;
        } else {
          return 'Please enter your password.';
        }
      }
    },
  ];
  return inquirer.prompt(questions);
}

export default askPassword;