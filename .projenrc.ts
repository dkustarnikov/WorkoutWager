import { awscdk } from 'projen';
import { NpmConfig, NodePackageManager } from 'projen/lib/javascript';

const project = new awscdk.AwsCdkTypeScriptApp({
  cdkVersion: '2.243.0',
  defaultReleaseBranch: 'main',
  name: 'workout-wager',
  projenrcTs: true,
  packageManager: NodePackageManager.NPM,
  npmRegistryUrl: 'https://registry.npmjs.org',
  gitignore: ['.env', './.claude/'],
  deps: [
    '@types/aws-lambda',
    '@types/aws-sdk',
    '@types/jest',
    '@types/node',
    'jsonwebtoken',
    'axios',
    'aws-sdk',
    'dotenv-cli',
    'dotenv',
    'uuid',
    'yup',
    'jwk-to-pem',
    'jwks-rsa',
  ], // Runtime dependencies of this module.
  devDeps: [
    'aws-cdk-lib',
    'aws-lambda-mock-context',
    'constructs',
    '@types/jsonwebtoken',
    '@types/jwk-to-pem',
    '@types/aws-lambda',
    '@types/uuid',
    'typescript',
    'copyfiles',
    'ts-dotenv',
    'ts-node',
    'ts-jest@^29',
  ], // Build dependencies for this module.
  tsconfig: {
    compilerOptions: {
      outDir: './dist',
      rootDir: './src',
      target: 'ES2020',
      module: 'NodeNext',
      strict: true,
      esModuleInterop: true,
    },
    include: ['src/**/*.ts'],
    exclude: ['node_modules'],
  },
});

// Add custom scripts

project.package.setScript('projen', 'ts-node --project tsconfig.dev.json .projenrc.ts');
project.package.setScript('build', 'tsc');
project.package.setScript('checkBranch', 'node check-branch.ts');

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
  rules: {}
});

// Add legacy-peer-deps so projen's bundled ts-jest@27 doesn't block installs
const npmConfig = new NpmConfig(project);
npmConfig.addConfig('legacy-peer-deps', 'true');

project.synth();