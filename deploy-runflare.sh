#!/bin/bash

echo "Deploying Trade Publisher Server to Runflare..."

# Check if runflare CLI is installed
if ! command -v runflare &> /dev/null; then
    echo "Error: Runflare CLI is not installed"
    echo "Install it with: npm install -g @runflare/cli"
    exit 1
fi

# Check if logged in
if ! runflare whoami &> /dev/null; then
    echo "Error: Not logged in to Runflare"
    echo "Login with: runflare login"
    exit 1
fi

# Build and deploy
echo "Building project..."
npm install --production

echo "Deploying to Runflare..."
runflare deploy

echo "Deployment completed!"
echo "Your server should be available at the provided Runflare URL"
