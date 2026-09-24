@echo off
title AutoSurveyX AI - Auto Launcher
cd /d "%~dp0"
echo ========================================================
echo   AutoSurveyX AI Verification Platform
echo ========================================================
echo Checking server status...
netstat -ano | findstr :4000 >nul 2>&1
if %errorlevel% equ 0 (
    echo Server is already running on port 4000.
) else (
    echo Starting server on http://localhost:4000...
    start /b "" node backend/server.js
    timeout /t 2 /nobreak >nul
)
echo Opening AutoSurveyX in your default web browser...
start http://localhost:4000
echo.
echo Application is accessible at:
echo Local:   http://localhost:4000
echo Network: http://192.168.1.161:4000
echo ========================================================
timeout /t 5
