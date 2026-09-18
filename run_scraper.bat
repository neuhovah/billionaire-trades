@echo off
SET LOG_FILE=C:\Users\HP 840 G6\Desktop\BillionairesTrade.com\backend\pipeline_log.txt

echo ================================================== >> "%LOG_FILE%"
echo === Starting BillionairesTrade Execution Pipeline === >> "%LOG_FILE%"
echo Date: %DATE% | Time: %TIME% >> "%LOG_FILE%"
echo ================================================== >> "%LOG_FILE%"

:: Change directory to backend root
cd /d "C:\Users\HP 840 G6\Desktop\BillionairesTrade.com\backend"

:: Verify and activate virtual environment
IF EXIST "venv\Scripts\activate.bat" (
    call venv\Scripts\activate.bat
) ELSE (
    echo [CRITICAL ERROR] Virtual environment not found at venv\Scripts\activate.bat >> "%LOG_FILE%"
    goto END
)

:: Step 1: Run 13F Institutional Scraper
echo --- [1/3] Executing 13F Institutional Scraper (global_scraper.py) --- >> "%LOG_FILE%"
python global_scraper.py >> "%LOG_FILE%" 2>&1

:: Step 2: Run Form 4 Insider Transactions Scraper
echo --- [2/3] Executing Form 4 Insider Scraper (form4_scraper.py) --- >> "%LOG_FILE%"
python form4_scraper.py >> "%LOG_FILE%" 2>&1

:: Step 3: Run Schedule 13D/G Activist Stakes Scraper
echo --- [3/3] Executing 13D/G Activist Scraper (activist_scraper.py) --- >> "%LOG_FILE%"
python activist_scraper.py >> "%LOG_FILE%" 2>&1

:END
echo ================================================== >> "%LOG_FILE%"
echo === Pipeline Completed at %TIME% === >> "%LOG_FILE%"
echo ================================================== >> "%LOG_FILE%"
echo. >> "%LOG_FILE%"