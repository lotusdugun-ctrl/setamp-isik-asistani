@echo off
chcp 65001 >nul
title SetAmp PRO — Yerel & Telefon Sunucusu
cd /d "%~dp0"
node server.js
pause
