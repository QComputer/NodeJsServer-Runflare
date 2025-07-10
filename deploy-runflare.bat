@echo off
echo Deploying Trade Publisher Server to Runflare...

where runflare >nul 2>nul
if %errorlevel% neq 0 (
    echo Error: Runflare CLI is not installed
    echo Install it with: npm install -g @runflare/cli
    pause
    exit /b 1
)

echo Login...
runflare login


echo Building project...
npm install --production

echo Deploying to Runflare...
runflare deploy

echo Deployment completed!
echo Server should be available at the provided Runflare URL
pause