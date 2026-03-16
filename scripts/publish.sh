#!/bin/bash
set -e

# Lang Context Attention - npm publish script
# Usage: ./scripts/publish.sh <OTP>
# Example: ./scripts/publish.sh 123456

OTP=${1:?"Usage: $0 <OTP_CODE>"}

echo "Publishing @lang-context packages with OTP: $OTP"
echo ""

# Build all packages first
echo "=== Building packages ==="
pnpm build
echo ""

# Publish in dependency order: core → store-sqlite / provider-ai-sdk
echo "=== Publishing @lang-context/core ==="
cd packages/core
npm publish --access public --otp "$OTP"
echo "Done."
cd ../..

echo ""
echo "=== Publishing @lang-context/store-sqlite ==="
cd packages/store-sqlite
npm publish --access public --otp "$OTP"
echo "Done."
cd ../..

echo ""
echo "=== Publishing @lang-context/provider-ai-sdk ==="
cd packages/provider-ai-sdk
npm publish --access public --otp "$OTP"
echo "Done."
cd ../..

echo ""
echo "All packages published successfully!"
echo ""
echo "Install:"
echo "  pnpm add @lang-context/core @lang-context/store-sqlite @lang-context/provider-ai-sdk"
