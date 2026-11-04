@echo off
setlocal
set "CS_BOOSTER_EXE=%~dp0release\CS Booster\CS Booster.exe"
if not exist "%CS_BOOSTER_EXE%" (
  echo Pacote portatil nao encontrado. Gere-o com npm run package.
  pause
  exit /b 1
)
powershell.exe -NoLogo -NoProfile -Command "try { Start-Process -FilePath $env:CS_BOOSTER_EXE -Verb RunAs -ErrorAction Stop } catch { Write-Host 'A abertura como administrador foi cancelada ou falhou.'; exit 1 }"
endlocal
