@echo off
setlocal enabledelayedexpansion

:: LABS Update Script for Windows
:: This script updates the application while preserving user settings

echo ===============================================
echo LABS Update Tool
echo ===============================================
echo This tool will update your LABS application while preserving your settings.
echo.

:: Check if the .config directory exists
if not exist ".config" (
  echo Error: .config directory not found.
  echo Are you running this in your existing LABS installation directory?
  exit /b 1
)

:: Check if .env exists
if not exist ".env" (
  echo Warning: .env file not found.
  echo Your environment settings might not be preserved.
)

:: Create backup directory
for /f "tokens=2 delims==" %%a in ('wmic OS Get localdatetime /value') do set "dt=%%a"
set "TIMESTAMP=%dt:~0,8%_%dt:~8,6%"
set "BACKUP_DIR=backup_%TIMESTAMP%"
echo Creating backup directory: %BACKUP_DIR%
mkdir "%BACKUP_DIR%"

:: Backup config files
echo Backing up your configuration...
xcopy /E /I /H ".config" "%BACKUP_DIR%\.config"
if exist ".env" (
  copy ".env" "%BACKUP_DIR%\"
)

:: Get the current directory name
for %%I in (.) do set "CURRENT_DIR=%%~nxI"
for %%I in (..) do set "PARENT_DIR=%%~fI"
set "UPDATE_DIR=%PARENT_DIR%\%CURRENT_DIR%_update"

echo Creating temporary update directory: %UPDATE_DIR%
mkdir "%UPDATE_DIR%"

:: Ask for update zip file
echo.
echo Please specify the path to the update ZIP file:
set /p UPDATE_ZIP="> "

if not exist "%UPDATE_ZIP%" (
  echo Error: Update file not found at %UPDATE_ZIP%
  echo Update canceled.
  rmdir /S /Q "%UPDATE_DIR%"
  exit /b 1
)

:: Check if 7-Zip is available for extraction
where 7z >nul 2>nul
if %ERRORLEVEL% EQU 0 (
  :: Use 7-Zip if available
  echo Extracting update files with 7-Zip...
  7z x "%UPDATE_ZIP%" -o"%UPDATE_DIR%" -y >nul
) else (
  :: Fallback to PowerShell for extraction
  echo Extracting update files with PowerShell...
  powershell -command "Expand-Archive -Path '%UPDATE_ZIP%' -DestinationPath '%UPDATE_DIR%' -Force"
)

:: Check if it's a valid LABS installation
if not exist "%UPDATE_DIR%\package.json" (
  echo Error: The update does not appear to be a valid LABS installation.
  echo Update canceled.
  rmdir /S /Q "%UPDATE_DIR%"
  exit /b 1
)

echo.
echo Ready to update. This will:
echo 1. Copy your config files to the new version
echo 2. Install any new dependencies
echo 3. Replace your current installation with the update
echo.
echo Your current installation will be backed up to: %BACKUP_DIR%
echo.

set /p CONFIRM="Continue with update? (y/n): "
if /i not "%CONFIRM%"=="y" (
  echo Update canceled.
  rmdir /S /Q "%UPDATE_DIR%"
  exit /b 0
)

:: Copy config files to update directory
echo Copying your configuration to the new version...
if exist ".config" (
  xcopy /E /I /H ".config" "%UPDATE_DIR%\.config"
)
if exist ".env" (
  copy ".env" "%UPDATE_DIR%\"
)

:: Install dependencies in update directory
echo Installing dependencies for the new version...
cd "%UPDATE_DIR%"
call npm install --quiet

if %ERRORLEVEL% NEQ 0 (
  echo Error: Failed to install dependencies.
  echo Update canceled.
  exit /b 1
)

cd "%PARENT_DIR%"

:: Rename directories to complete the update
set "OLD_DIR=%CURRENT_DIR%_old_%TIMESTAMP%"
ren "%PARENT_DIR%\%CURRENT_DIR%" "%OLD_DIR%"
ren "%PARENT_DIR%\%CURRENT_DIR%_update" "%CURRENT_DIR%"

echo.
echo ===============================================
echo Update Complete!
echo ===============================================
echo The new version has been installed with your existing configuration.
echo Your previous installation has been renamed to: %OLD_DIR%
echo.
echo You can now run the application with: cd %CURRENT_DIR% ^&^& npm run labs
echo.
echo If you encounter any issues, your backup is available at: %BACKUP_DIR%
echo ===============================================

endlocal 