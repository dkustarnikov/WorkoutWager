
# Workout Wager API (Archived Version)

This repository contains the **archived version** of the Workout Wager API. It represents the earlier implementation of the project and showcases significant progress and accomplishments up to this point. While this version is now outdated, it serves as a testament to the development milestones achieved.

---

## **Project Overview**
The Workout Wager API provides a backend solution for managing workouts, user authentication, and wager functionality. It was designed to handle the following key workflows:

1. **User Management**:
   - User creation (via AWS Cognito).
   - Updating user profiles.
   - Deleting user accounts.

2. **Workout Management**:
   - Adding, updating, and deleting workouts.
   - Querying workout lists.

3. **Swagger Documentation**:
   - Fully documented API endpoints, including request and response formats.

4. **Technology Stack**:
   - **Backend**: AWS Lambda, Node.js, TypeScript.
   - **Infrastructure**: AWS CDK for deploying serverless architecture.
   - **Database**: DynamoDB for data storage.
   - **Documentation**: Swagger (OpenAPI 3.0).

---

## **Key Accomplishments**
- **Infrastructure-as-Code**: Configured using AWS CDK to streamline deployment and updates.
- **Scalable Architecture**: Serverless backend powered by AWS Lambda and API Gateway.
- **Event-Driven Design**: Handled time-based workout events and triggers for wagers.
- **Comprehensive Documentation**: Fully documented using Swagger (see below).

---

## **API Documentation (Swagger)**

### **User Management**
- **POST /users/signup**: Registers a new user.
- **POST /users/login**: Authenticates a user and returns a JWT token.
- **GET /users/profile**: Retrieves user profile information.
- **PUT /users/profile**: Updates user profile information.
- **DELETE /users/{userId}**: Deletes a user account.

### **Workout Management**
- **POST /workouts**: Creates a new workout.
- **GET /workouts**: Retrieves a list of workouts.
- **PUT /workouts/{workoutId}**: Updates an existing workout.
- **DELETE /workouts/{workoutId}**: Deletes a workout.

### **Swagger Spec**
The Swagger documentation provides detailed request and response formats for all endpoints. Use tools like [Swagger Editor](https://editor.swagger.io/) to view or modify the OpenAPI documentation.

---

## **Technology Highlights**
- **AWS Cognito**: Secure user authentication and JWT token generation.
- **AWS Lambda**: Serverless backend functions for scalable operations.
- **API Gateway**: Routing for REST API endpoints.
- **DynamoDB**: NoSQL database for efficient data storage.
- **TypeScript**: Strongly typed programming for robust code quality.

---

## **Setup Instructions**
1. Clone the repository:
   ```bash
   git clone https://github.com/dkustarnikov/WorkoutWager.git
   cd WorkoutWager
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Deploy the stack (requires AWS CLI and CDK configured):
   ```bash
   cdk deploy
   ```
4. Test endpoints using tools like Postman or Swagger UI.

---

## **Why This Repository is Archived**
This version of the project has been superseded by a new repository with updated features and architecture. While no longer actively maintained, it showcases the foundation of the Workout Wager project and key development milestones.

---

## **New Repository**
For the latest updates, features, and continued development, refer to the new repository: **[New Workout Wager Repository](https://github.com/dkustarnikov/GoalPledge)**.

---

## **Contact**
For any questions or inquiries, feel free to reach out via GitHub issues.

---

## **Acknowledgments**
This project was a significant milestone in learning and implementing scalable backend solutions using AWS and serverless technologies.
