@rem
@rem MemoryReel Android Build System
@rem Gradle wrapper script optimized for mobile and TV platform builds
@rem Java version: 11+ required
@rem

@if "%DEBUG%" == "" @echo off
@rem ##########################################################################
@rem
@rem  Gradle startup script for Windows
@rem
@rem ##########################################################################

@rem Set local scope for the variables with windows NT shell
if "%OS%"=="Windows_NT" setlocal

set DIRNAME=%~dp0
if "%DIRNAME%" == "" set DIRNAME=.

@rem Configure default JVM options optimized for MemoryReel builds
set DEFAULT_JVM_OPTS="-Xmx2048m" "-Xms512m" "-XX:MaxPermSize=512m" "-XX:+HeapDumpOnOutOfMemoryError" "-Dfile.encoding=UTF-8"

@rem Add platform-specific memory settings for TV builds
if "%1" == "tv" (
    set DEFAULT_JVM_OPTS=%DEFAULT_JVM_OPTS% "-XX:+UseG1GC" "-XX:G1HeapRegionSize=16M"
)

@rem Find java.exe
if defined JAVA_HOME goto findJavaFromJavaHome

set JAVA_EXE=java.exe
%JAVA_EXE% -version >NUL 2>&1
if "%ERRORLEVEL%" == "0" goto validateJavaVersion

echo.
echo ERROR: JAVA_HOME is not set and no 'java' command could be found in your PATH.
echo.
echo Please set the JAVA_HOME variable in your environment to match the
echo location of your Java installation for MemoryReel builds.
echo Java 11 or higher is required.

goto fail

:findJavaFromJavaHome
set JAVA_HOME=%JAVA_HOME:"=%
set JAVA_EXE=%JAVA_HOME%/bin/java.exe

if exist "%JAVA_EXE%" goto validateJavaVersion

echo.
echo ERROR: JAVA_HOME is set to an invalid directory: %JAVA_HOME%
echo.
echo Please set the JAVA_HOME variable in your environment to match the
echo location of your Java installation for MemoryReel builds.

goto fail

:validateJavaVersion
@rem Validate Java version for React Native compatibility
"%JAVA_EXE%" -version 2>&1 | findstr /i "version" > tmp.txt
set /p JAVA_VERSION=<tmp.txt
del tmp.txt

echo %JAVA_VERSION% | findstr /i "11\." > nul
if errorlevel 1 (
    echo.
    echo ERROR: Java 11 or higher is required for MemoryReel builds.
    echo Current version: %JAVA_VERSION%
    goto fail
)

:validateGradleWrapper
@rem Validate Gradle wrapper integrity
set WRAPPER_JAR=%DIRNAME%\gradle\wrapper\gradle-wrapper.jar
set WRAPPER_PROPERTIES=%DIRNAME%\gradle\wrapper\gradle-wrapper.properties

if not exist "%WRAPPER_JAR%" (
    echo.
    echo ERROR: Gradle wrapper JAR not found at: %WRAPPER_JAR%
    echo Please ensure the Gradle wrapper is properly installed.
    goto fail
)

if not exist "%WRAPPER_PROPERTIES%" (
    echo.
    echo ERROR: Gradle wrapper properties not found at: %WRAPPER_PROPERTIES%
    echo Please ensure the Gradle wrapper is properly installed.
    goto fail
)

:execute
@rem Setup the command line for mobile and TV platform builds

set CLASSPATH=%WRAPPER_JAR%

@rem Execute Gradle with platform-specific optimizations
"%JAVA_EXE%" %DEFAULT_JVM_OPTS% ^
  "-Dorg.gradle.appname=%APP_BASE_NAME%" ^
  -classpath "%CLASSPATH%" ^
  org.gradle.wrapper.GradleWrapperMain %*

:end
@rem End local scope for the variables with windows NT shell
if "%ERRORLEVEL%"=="0" goto mainEnd

:fail
rem Set variable GRADLE_EXIT_CONSOLE if you need the _script_ return code instead of
rem the _cmd.exe /c_ return code!
if  not "" == "%GRADLE_EXIT_CONSOLE%" exit 1
exit /b 1

:mainEnd
if "%OS%"=="Windows_NT" endlocal

:omega