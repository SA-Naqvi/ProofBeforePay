@echo off
setlocal
cd /d "%~dp0"

rem ProofBeforePay: starts the API (port 8001; 8000 is often taken by other apps) and the web app (port 3000) in two windows.
rem First run creates the Python virtualenv and installs dependencies.

if not exist ".env" (
  copy ".env.example" ".env" >nul
  echo Created .env from .env.example.
  echo Open it and set NEBIUS_API_KEY and TAVILY_API_KEY, then run this file again.
  notepad ".env"
  exit /b 1
)

if not exist "apps\api\.venv\Scripts\python.exe" (
  echo Setting up the Python environment...
  python -m venv "apps\api\.venv" || goto :fail
  "apps\api\.venv\Scripts\python.exe" -m pip install -q -r "apps\api\requirements-dev.txt" || goto :fail
)

if not exist "apps\web\node_modules" (
  echo Installing web dependencies...
  pushd "apps\web"
  call npm install --no-audit --no-fund || (popd & goto :fail)
  popd
)

start "ProofBeforePay API" /d "apps\api" cmd /k ".venv\Scripts\python.exe -m uvicorn app.main:app --reload --port 8001"
start "ProofBeforePay Web" /d "apps\web" cmd /k "set API_ORIGIN=http://127.0.0.1:8001&& npm run dev"

echo.
echo API:  http://127.0.0.1:8001  (docs at /docs)
echo App:  http://localhost:3000
timeout /t 6 >nul
start "" "http://localhost:3000"
exit /b 0

:fail
echo.
echo Setup failed. Check that Python 3.12+ and Node.js 20+ are installed and on PATH.
pause
exit /b 1
