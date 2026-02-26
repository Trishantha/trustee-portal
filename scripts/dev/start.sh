#!/bin/bash

# Trustee Portal Startup Script
# Starts the backend API server

echo "
╔═══════════════════════════════════════════════════════════╗
║                                                           ║
║   🏛️  Trustee Portal                                      ║
║   Backend + Frontend Startup                             ║
║                                                           ║
╚═══════════════════════════════════════════════════════════╝
"

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed. Please install Node.js 18+ to continue."
    exit 1
fi

NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 18 ]; then
    echo "⚠️  Node.js version $NODE_VERSION detected. Node.js 18+ is recommended."
fi

echo "✅ Node.js version: $(node -v)"
echo ""

# Check if dependencies are installed
if [ ! -d "backend/node_modules" ]; then
    echo "📦 Installing backend dependencies..."
    cd backend && npm install && cd ..
    echo "✅ Dependencies installed"
    echo ""
fi

# Start the server
echo "🚀 Starting Trustee Portal Server..."
echo ""
echo "Once started, open your browser to:"
echo "  🌐 http://localhost:3001"
echo ""
echo "Platform Admin credentials:"
echo "  👤 Email: platform@admin.com"
echo "  🔑 Password: admin123"
echo ""
echo "Press Ctrl+C to stop the server"
echo "─────────────────────────────────────────────────────────────"
echo ""

cd backend && npm start
