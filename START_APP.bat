@echo off
echo ========================================
echo Starting E-TIPS Application
echo ========================================
echo.
echo Checking Python...
python --version
echo.
echo Starting Flask server on port 8080...
echo.
echo The app will be available at:
echo   http://localhost:8080
echo   http://127.0.0.1:8080
echo.
echo Press Ctrl+C to stop the server
echo ========================================
echo.
python app.py
