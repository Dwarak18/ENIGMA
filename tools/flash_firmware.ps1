$env:MSYSTEM = ''
$env:IDF_PATH = 'C:\Espressif\frameworks\esp-idf-v5.3.1'
$env:IDF_PYTHON_ENV_PATH = 'C:\Espressif\python_env\idf5.3_py3.11_env'

$toolPaths = @(
    'C:\Espressif\tools\xtensa-esp-elf\esp-13.2.0_20240530\xtensa-esp-elf\bin',
    'C:\Espressif\tools\riscv32-esp-elf\esp-13.2.0_20240530\riscv32-esp-elf\bin',
    'C:\Espressif\tools\cmake\3.24.0\bin',
    'C:\Espressif\tools\ninja\1.11.1',
    'C:\Espressif\tools\idf-exe\1.0.3',
    'C:\Espressif\tools\ccache\4.8\ccache-4.8-windows-x86_64',
    'C:\Espressif\frameworks\esp-idf-v5.3.1\tools',
    'C:\Espressif\python_env\idf5.3_py3.11_env\Scripts'
) -join ';'

$env:PATH = $toolPaths + ';' + $env:PATH

Set-Location 'C:\Users\Bixbie\Documents\Project\ENIGMA\firmware'

$port = if ($args[0]) { $args[0] } else { 'COM7' }

Write-Host "=== Flashing to $port ===" -ForegroundColor Cyan
idf.py -p $port flash monitor
