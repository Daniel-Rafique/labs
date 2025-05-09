@echo off
echo.
echo  _       _    ___  ___ 
echo ^| ^|     / \  ^| _ )/ __^|
echo ^| ^|__  / _ \ ^| _ \^\___ \
echo ^|____/_/ \_\^|___/^|___/
echo.                       
echo Live AI Based Strategy
echo.

rem Check if npm is installed
where npm >nul 2>nul
if %ERRORLEVEL% neq 0 (
    echo [ERROR] npm is not installed. Please install Node.js first (https://nodejs.org)
    pause
    exit /b 1
)

echo [INFO] Checking environment...
echo [INFO] Installation directory: %~dp0

rem Check for .env file
set ENV_FILE=.env
if not exist "%ENV_FILE%" (
    echo.
    echo [INFO] Setting up configuration...
    echo.

    rem Prompt for RPC URL
    echo [INPUT] Please enter your Solana RPC URL (required)
    echo Example: https://api.mainnet-beta.solana.com
    set /p rpc_url="RPC URL: "
    
    :rpc_url_check
    if "%rpc_url%"=="" (
        echo [ERROR] RPC URL is required. Please enter a valid URL:
        set /p rpc_url="RPC URL: "
        goto :rpc_url_check
    )
    
    rem Prompt for secondary RPC URL
    echo.
    echo [INPUT] Please enter a secondary Solana RPC URL (optional, press Enter to skip)
    echo Example: https://api.mainnet-beta.solana.com
    set /p rpc_url2="Secondary RPC URL: "
    
    rem Prompt for OpenAI API key
    echo.
    echo [INPUT] Please enter your OpenAI API key (required for some features)
    set /p openai_key="OpenAI API Key: "
    
    :openai_key_check
    if "%openai_key%"=="" (
        echo [ERROR] OpenAI API key is required. Please enter a valid key:
        set /p openai_key="OpenAI API Key: "
        goto :openai_key_check
    )
    
    rem Prompt for license key
    echo.
    echo [INPUT] Please enter your license key (required, provided at purchase)
    set /p license_key="License Key: "
    
    :license_key_check
    if "%license_key%"=="" (
        echo [ERROR] License key is required. Please enter the license key provided with your purchase:
        set /p license_key="License Key: "
        goto :license_key_check
    )
    
    rem Create the .env file
    echo # Generated configuration > "%ENV_FILE%"
    echo SOLANA_RPC=%rpc_url% >> "%ENV_FILE%"
    
    rem Add secondary RPC if provided
    if not "%rpc_url2%"=="" (
        echo SOLANA_RPC_2=%rpc_url2% >> "%ENV_FILE%"
    )
    
    echo OPENAI_API_KEY=%openai_key% >> "%ENV_FILE%"
    
    rem Add license key
    echo LICENSE_KEY=%license_key% >> "%ENV_FILE%"
    
    echo [SUCCESS] Configuration saved to %ENV_FILE%
) else (
    echo [INFO] Using existing .env configuration
)

rem Check for license key if not in .env file
findstr /C:"LICENSE_KEY" "%ENV_FILE%" >nul 2>&1
if errorlevel 1 (
    echo.
    echo [INFO] License setup
    echo A valid license key is required to use this software.
    echo Please enter the license key provided with your purchase:
    set /p license_key="License key: "
    
    :license_key_check2
    if "%license_key%"=="" (
        echo [ERROR] License key is required. Please enter the license key provided with your purchase:
        set /p license_key="License Key: "
        goto :license_key_check2
    )
    
    rem Save to env file
    echo LICENSE_KEY=%license_key% >> "%ENV_FILE%"
    echo [SUCCESS] License key added to .env file
)

rem Install dependencies
echo.
echo [INFO] Installing dependencies...
call npm install --no-audit

echo.
echo [SUCCESS] Installation complete!
echo.
echo To start the application, run:
echo   npm run labs
echo.
echo For help or support, contact support@koynlabs.com
echo.
pause 