import { awscdk } from 'projen';
import { NodePackageManager } from 'projen/lib/javascript';

// Single source of truth for package.json, tsconfig*.json, jest and eslint config.
// Edit this file and run `npx projen` — never hand-edit the generated files.
const project = new awscdk.AwsCdkTypeScriptApp({
  cdkVersion: '2.243.0',
  defaultReleaseBranch: 'main',
  name: 'workout-wager',
  description: 'WorkoutWager — a serverless API for goals with money on the line.',
  projenrcTs: true,
  packageManager: NodePackageManager.NPM,
  npmRegistryUrl: 'https://registry.npmjs.org',
  gitignore: ['.env', '.claude/'],
  deps: [
    '@types/aws-lambda',
    'aws-sdk',
    'jsonwebtoken',
    'jwks-rsa',
    'uuid',
    'yup',
  ],
  devDeps: [
    '@types/jsonwebtoken',
    '@types/uuid',
  ],
  tsconfig: {
    compilerOptions: {
      target: 'ES2020',
      lib: ['es2022'],
      esModuleInterop: true,
    },
  },
});

project.jest!.config.testTimeout = 30000;

project.synth();
