@echo off
title remo - Startup Loader

echo ===================================================
echo               remo Remote Control Loader           
echo ===================================================
echo.

rem Check if Python is installed
python --version >nul 2>&1
if errorlevel 1 goto nopython

echo [1/2] Verifying and installing dependencies...
python -m pip install -r requirements.txt
if errorlevel 1 (
    echo.
    echo [WARNING] Failed to install dependencies automatically.
    echo Trying to launch anyway...
    echo.
)

echo [2/2] Launching remo Desktop Server...
echo.
python remo_desktop.py
if errorlevel 1 (
    echo.
    echo [ERROR] The server crashed or stopped unexpectedly.
    echo Please review the error messages above.
    pause
)
exit /b

:nopython
echo [ERROR] Python is not installed or not in your system PATH!
echo Please install Python (3.9+) and check "Add Python to PATH" during setup.
echo.
echo Press any key to open the official Python download page...
pause
start https://www.python.org/downloads/
exit /b
