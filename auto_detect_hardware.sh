#!/bin/bash

# ENIGMA Device Auto-Detector (Linux/WSL)
# Monitors USB-serial events to detect ESP32-S3 plug/unplug events.

# Colors for output
CYAN='\033[0;36m'
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
GRAY='\033[0;90m'
NC='\033[0m' # No Color

echo -e "${CYAN}╔══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${CYAN}║       ENIGMA Linux Auto-Detection Script                     ║${NC}"
echo -e "${CYAN}║       Monitors /dev for ESP32-S3 plug/unplug events          ║${NC}"
echo -e "${CYAN}╚══════════════════════════════════════════════════════════════╝${NC}"
echo ""

# Navigate to the listener directory
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$SCRIPT_DIR/tools/device_listener"

# Check if python3 is installed
if ! command -v python3 &> /dev/null; then
    echo -e "${RED}[ERROR] python3 is not installed.${NC}"
    echo -e "${YELLOW}Please run: sudo apt update && sudo apt install -y python3 python3-pip python3-venv libudev-dev${NC}"
    exit 1
fi

# Install system dependencies that pip needs to compile some packages
echo -e "${GRAY}Verifying system libraries...${NC}"
if [[ "$OSTYPE" == "linux-gnu"* ]]; then
    echo -e "${GRAY}Note: If installation fails, you may need to run:${NC}"
    echo -e "${GRAY}sudo apt update && sudo apt install -y libudev-dev python3-dev libssl-dev libffi-dev build-essential${NC}"
fi

# Install dependencies into a virtual environment to avoid system conflicts
echo -e "${GRAY}Setting up Python environment...${NC}"
if [ ! -d "venv" ]; then
    python3 -m venv venv
fi
source venv/bin/activate

echo -e "${GRAY}Installing pip packages...${NC}"
python3 -m pip install --upgrade pip --quiet
python3 -m pip install -r requirements.txt --quiet

if [ $? -ne 0 ]; then
    echo -e "${RED}[ERROR] pip installation failed.${NC}"
    echo -e "${YELLOW}Try installing without pyudev (polling mode):${NC}"
    echo -e "${YELLOW}sed -i '/pyudev/d' requirements.txt && python3 -m pip install -r requirements.txt${NC}"
    exit 1
fi

# Determine Backend URL
# If running in WSL and backend is on Windows, use the host IP.
# If backend is also in Linux, localhost is fine.
if grep -q Microsoft /proc/version; then
    # In WSL, try to find the Windows Host IP
    WINDOWS_HOST=$(hostname).local
    export BACKEND_URL="http://$WINDOWS_HOST:3000"
    echo -e "${GRAY}WSL Detected. Using Windows Host: $BACKEND_URL${NC}"
else
    export BACKEND_URL="http://localhost:3000"
fi

export SKIP_HANDSHAKE="true"

echo -e "${GREEN}Starting listener...${NC}"
echo -e "${GRAY}Press Ctrl+C to stop.${NC}"
echo ""

# On Linux, we might need sudo for udev/serial access depending on user groups
if [[ "$OSTYPE" == "linux-gnu"* ]]; then
    if ! groups | grep -q '\(dialout\|uucp\)'; then
        echo -e "${YELLOW}[TIP] If connection fails, run: sudo usermod -a -G dialout $USER${NC}"
    fi
fi

python3 listener.py
