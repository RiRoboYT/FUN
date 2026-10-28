@echo off
title StudyForge
cd /d "%~dp0"
echo Starting StudyForge at http://localhost:8642 ...
echo Keep this window open while you use StudyForge. Close it to stop.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0tools\serve.ps1" -Port 8642
