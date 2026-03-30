# API Authentication Guide

## Overview
The Logics Public API uses **Basic Authentication** to secure all requests. You'll need two credentials:
- **Username:** Your API Key
- **Password:** Your Secret Token

## Getting Your Credentials

### 1. API Key (Username)
Your API Key serves as the username for Basic Authentication.

To retrieve your API Key:
1. Log in to the Logics Dashboard
2. Navigate to **Security → API Key**
3. Review the available API Keys
4. Select an appropriate key based on your needs:
   - Read operations → Choose a key with `GET` permissions
   - Write operations → Choose a key with `POST` permissions

> [!IMPORTANT]
> Ensure your selected API Key has the necessary permissions for your intended operations.

### 2. Secret Token (Password)
Your Secret Token serves as the password for Basic Authentication.

To generate your Secret Token:
1. Navigate to **Settings → Integrations**
2. Click **Generate Token**
3. Copy and securely store the generated token

> [!CAUTION]
> Security Note: Treat your Secret Token like a password. Store it securely and never share it publicly.

## Using Your Credentials
When making API requests, include both credentials in the **Basic Authentication** header:
- **Username:** Your API Key
- **Password:** Your Secret Token

## Best Practices
- Use API Keys with minimal required permissions.
- Rotate your Secret Tokens regularly.
- Never expose credentials in client-side code.
- Store credentials in environment variables (`.env`) or secure key management systems.

## Need Help?
If you encounter authentication issues:
- Verify your API Key has the correct permissions.
- Ensure your Secret Token is current and correctly copied.
- Check that both credentials are properly formatted in your request headers.
