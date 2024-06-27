const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

try {
  const branch = execSync('git rev-parse --abbrev-ref HEAD').toString().trim();
  let stackName = '';

  if (branch === 'main' || branch === 'master') {
    console.log('Deploying to the dev stack');
    stackName = 'dev';
  } else {
    console.log(`The branch we are on is ${branch} stack`);
    stackName = branch;
  }

  // Read the .env file if it exists
  const envFilePath = path.join(__dirname, '.env');
  let envFileContent = '';
  if (fs.existsSync(envFilePath)) {
    envFileContent = fs.readFileSync(envFilePath, 'utf8');
  }

  // Check if STACK_NAME is already present
  if (!envFileContent.includes('STACK_NAME=')) {
    // Append the stack name to the .env file
    fs.appendFileSync(envFilePath, `STACK_NAME=${stackName}\n`);
  } else {
    console.log('STACK_NAME is already set in the .env file');
  }

} catch (error) {
  console.error('Failed to determine the branch name', error);
  process.exit(1);
}
