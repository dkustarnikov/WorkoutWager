import { awscdk } from 'projen';
import { NodePackageManager } from 'projen/lib/javascript';

const project = new awscdk.AwsCdkTypeScriptApp({
  cdkVersion: '2.1.0',
  defaultReleaseBranch: 'main',
  name: 'workout-wager',
  projenrcTs: true,
  packageManager: NodePackageManager.NPM,
  gitignore: ['.env'],
  deps: [
    '@types/aws-lambda',
    'jsonwebtoken',
    'axios',
    'aws-sdk',
    'dotenv-cli',
    'dotenv'
  ], // Runtime dependencies of this module.
  devDeps: [
    'aws-cdk-lib',
    'aws-lambda-mock-context',
    'constructs',
    '@types/jsonwebtoken',
    '@types/jwk-to-pem',
    '@types/aws-lambda',
    'typescript',
    'copyfiles',
    'ts-dotenv',
    'ts-node',
    'jwks-rsa',
    'jwk-to-pem'
  ], // Build dependencies for this module.
  tsconfig: {
    compilerOptions: {
      outDir: './dist',
      rootDir: './src',
      target: 'ES2020',
      module: 'commonjs',
      strict: true,
      esModuleInterop: true,
    },
    include: ['src/**/*.ts'],
    exclude: ['node_modules'],
  },
});

// Add custom scripts
project.addScripts({
  projen: 'ts-node --project tsconfig.dev.json .projenrc.ts',
  build: 'tsc',
  checkBranch: 'node check-branch.ts'
});

// Remove the existing deploy task
project.removeTask('deploy');

// Add a new deploy task
project.addTask('deploy', {
  exec: 'ts-node check-branch.ts && dotenv -e .env -- cdk deploy --require-approval never --stack-name $STACK_NAME',
});
// Enables unit tests on windows
project.jest?.addTestMatch('<rootDir>/test/**/*(*.)@(spec|test).ts?(x)');
project.jest?.addTestMatch('<rootDir>/src/**/*(*.)@(spec|test).ts?(x)');
project.jest!.config.modulePaths = ['<rootDir>'];
project.jest!.config.testTimeout = 30000; // 30 seconds


// Use tsconfig.test.json for ESLint
project.eslint?.addOverride({
  files: ['test/**/*.ts'],
  ...{
    parserOptions: {
      project: ['./tsconfig.json', './tsconfig.test.json'],
    },
  },
});

project.synth();