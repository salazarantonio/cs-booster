@echo off
cd /d "%~dp0"
if exist "release\CS Booster\CS Booster.exe" (
  start "" "release\CS Booster\CS Booster.exe"
) else (
  echo Execute npm install e npm start nesta pasta para iniciar o projeto.
  pause
)
