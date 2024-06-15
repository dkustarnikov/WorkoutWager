# AWS CDK Lambda TypeScript Template

This repository is a template for creating AWS Lambda functions using the AWS Cloud Development Kit (CDK) with TypeScript.

## Features

- **AWS CDK**: Leverage the power of AWS CDK to define your cloud infrastructure in TypeScript.
- **TypeScript**: Write your Lambda functions using TypeScript for better code quality and developer experience.
- **Best Practices**: Pre-configured with best practices for project structure, linting, and testing.

## Prerequisites

- Node.js (>= 14.x)
- AWS CLI
- AWS CDK

## Getting Started

### Clone the repository

git clone https://github.com/dkustarnikov/aws_cdk_lambda_typescript_template.git
cd aws_cdk_lambda_typescript_template

### Install dependencies

npm install

### Configure AWS

Ensure that your AWS CLI is configured with appropriate credentials.

### Deploy the stack

cdk deploy

## Project Structure

- `src/`: Contains the Lambda function code.
- `test/`: Contains the test cases.
- `.projenrc.ts`: Configuration file for the project.
- `cdk.json`: Configuration file for CDK.

## Useful Commands

- `npm run build`: Compile TypeScript to JavaScript.
- `npm run watch`: Watch for changes and compile.
- `npm run test`: Run tests.
- `cdk synth`: Synthesize the CloudFormation template.
- `cdk deploy`: Deploy the stack.

## License

This project is licensed under the Apache-2.0 License.