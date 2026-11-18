@echo off
setlocal
pushd "%~dp0" || exit /b 1
if not exist "..\.venv\Scripts\python.exe" (
    echo Set up the Python environment first. See backend\README.md.
    popd
    exit /b 1
)
echo Open http://127.0.0.1:8000 in your browser.
"..\.venv\Scripts\python.exe" -m uvicorn main:app --host 127.0.0.1 --port 8000
set "app_exit=%errorlevel%"
popd
exit /b %app_exit%
