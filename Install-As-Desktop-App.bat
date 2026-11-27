@echo off
setlocal
cd /d "%~dp0"
set "PORT=8765"
set "PYTHON="
where py >nul 2>nul
if not errorlevel 1 py -3 -c "import http.server" >nul 2>nul
if not errorlevel 1 set "PYTHON=py -3"
if not defined PYTHON (
  where python >nul 2>nul
  if not errorlevel 1 python -c "import http.server" >nul 2>nul
  if not errorlevel 1 set "PYTHON=python"
)
if defined PYTHON goto launch_python_server
where powershell >nul 2>nul
if not errorlevel 1 goto launch_powershell_server
echo Python 3 and Windows PowerShell were not found. A local server is required to install the offline app.
pause
exit /b 1

:launch_python_server
start "Shahr Credit Advisor local server" /min cmd /k "cd /d ""%~dp0"" && %PYTHON% -m http.server %PORT% --bind 127.0.0.1"
goto open_app

:launch_powershell_server
start "Shahr Credit Advisor local server" /min powershell -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0Start-Local-Server.ps1" -Port %PORT%

:open_app
timeout /t 2 /nobreak >nul
start "" "http://127.0.0.1:%PORT%/index.html"
echo In Edge or Chrome, use the Install app menu after the page has loaded.
echo The local server window is minimized; keep it available during installation and the first load.
pause
