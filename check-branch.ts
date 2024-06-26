// check-branch.ts
import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

try {
  const branch = execSync('git rev-parse --abbrev-ref HEAD').toString().trim();
  let stackName = '';

  if (branch === 'main' || branch === 'master') {
    console.log('Deploying to the dev stack');
    stackName = 'dev';
  } else {
    console.log(`Deploying to the ${branch} stack`);
    stackName = branch;
  }

  // Write the stack name to a .env file
  const envFilePath = path.join(__dirname, '.env');
  fs.writeFileSync(envFilePath, `STACK_NAME=${stackName}\n`);

} catch (error) {
  console.error('Failed to determine the branch name', error);
  process.exit(1);
}
