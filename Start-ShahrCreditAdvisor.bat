@echo off
setlocal
rem Serve over localhost so the bundled offline voice and Service Worker can run.
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
goto file_fallback

:launch_python_server
start "Shahr Credit Advisor local server" /min cmd /c "cd /d ""%~dp0"" && %PYTHON% -m http.server %PORT% --bind 127.0.0.1"
goto server_started

:launch_powershell_server
start "Shahr Credit Advisor local server" /min powershell -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0Start-Local-Server.ps1" -Port %PORT%

:server_started
timeout /t 2 /nobreak >nul
where msedge >nul 2>nul
if not errorlevel 1 goto launch_edge_command
if exist "%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe" goto launch_edge_x86
if exist "%ProgramFiles%\Microsoft\Edge\Application\msedge.exe" goto launch_edge
if exist "%ProgramFiles%\Google\Chrome\Application\chrome.exe" goto launch_chrome
start "" "http://127.0.0.1:%PORT%/index.html"
exit /b

:launch_edge_command
start "" msedge --app="http://127.0.0.1:%PORT%/index.html" --window-size=1440,900
exit /b
:launch_edge_x86
start "" "%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe" --app="http://127.0.0.1:%PORT%/index.html" --window-size=1440,900
exit /b
:launch_edge
start "" "%ProgramFiles%\Microsoft\Edge\Application\msedge.exe" --app="http://127.0.0.1:%PORT%/index.html" --window-size=1440,900
exit /b
:launch_chrome
start "" "%ProgramFiles%\Google\Chrome\Application\chrome.exe" --app="http://127.0.0.1:%PORT%/index.html" --window-size=1440,900
exit /b

:file_fallback
echo Neither Python 3 nor Windows PowerShell was found. Opening the basic file view; speech features need localhost.
pause
start "" "%~dp0index.html"
