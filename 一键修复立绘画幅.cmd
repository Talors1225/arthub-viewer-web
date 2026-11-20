@echo off
setlocal
set "frameReport=%TEMP%\ArtHub-frame-audit-%RANDOM%-%RANDOM%"
if "%~1"=="" goto scan
if exist "%~1\summary.json" goto previous
if /i "%~nx1"=="summary.json" if exist "%~1" goto previous
:scan
node "%~dp0scripts\repair-portrait-frames.cjs" "--report-dir=%frameReport%" %*
goto report
:previous
node "%~dp0scripts\repair-portrait-frames.cjs" "--report-dir=%frameReport%" "--from-report=%~1"
:report
set "scanStatus=%ERRORLEVEL%"
if exist "%frameReport%\report.html" start "" "%frameReport%\report.html"
if not defined ARTHUB_NO_PAUSE pause
exit /b %scanStatus%
