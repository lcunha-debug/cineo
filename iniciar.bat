@echo off
title Cineo - Editor de Video
cd /d "%~dp0"

echo.
echo  ==========================================
echo     CINEO - Editor de Video Profissional
echo  ==========================================
echo.

:: Adiciona Node.js ao PATH se necessario
set "NODE_PATH=C:\Program Files\nodejs"
if exist "%NODE_PATH%\node.exe" (
    set "PATH=%NODE_PATH%;%PATH%"
)

:: Verifica se Node.js esta disponivel
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo  [ERRO] Node.js nao encontrado!
    echo.
    echo  Instale o Node.js em: https://nodejs.org
    echo  Baixe a versao LTS e instale normalmente.
    echo.
    pause
    exit /b 1
)

:: Instala dependencias se necessario
if not exist "node_modules\" (
    echo  Primeira execucao - instalando dependencias...
    echo  Aguarde, isso pode demorar alguns minutos.
    echo.
    npm install
    if %errorlevel% neq 0 (
        echo.
        echo  [ERRO] Falha ao instalar dependencias.
        pause
        exit /b 1
    )
    echo.
    echo  Dependencias instaladas com sucesso!
    echo.
)

:: Inicia o Cineo
echo  Iniciando o Cineo...
echo.
npm run dev
