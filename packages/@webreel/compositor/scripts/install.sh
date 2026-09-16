#!/bin/sh
set -e

REPO="vercel-labs/webreel"
INSTALL_DIR="${WEBREEL_INSTALL_DIR:-$HOME/.webreel/bin}"
BINARY_NAME="webreel"

detect_platform() {
    OS="$(uname -s)"
    ARCH="$(uname -m)"

    case "$OS" in
        Linux)  OS="linux" ;;
        Darwin) OS="darwin" ;;
        *)
            echo "Unsupported OS: $OS"
            exit 1
            ;;
    esac

    case "$ARCH" in
        x86_64|amd64)   ARCH="x86_64" ;;
        aarch64|arm64)   ARCH="aarch64" ;;
        *)
            echo "Unsupported architecture: $ARCH"
            exit 1
            ;;
    esac

    PLATFORM="${BINARY_NAME}-${OS}-${ARCH}"
}

get_latest_release() {
    if command -v curl >/dev/null 2>&1; then
        curl -fsSL "https://api.github.com/repos/${REPO}/releases/latest" | grep '"tag_name"' | head -1 | sed 's/.*"tag_name": *"\([^"]*\)".*/\1/'
    elif command -v wget >/dev/null 2>&1; then
        wget -qO- "https://api.github.com/repos/${REPO}/releases/latest" | grep '"tag_name"' | head -1 | sed 's/.*"tag_name": *"\([^"]*\)".*/\1/'
    else
        echo "Neither curl nor wget found. Please install one."
        exit 1
    fi
}

download() {
    URL="$1"
    DEST="$2"
    if command -v curl >/dev/null 2>&1; then
        curl -fsSL "$URL" -o "$DEST"
    elif command -v wget >/dev/null 2>&1; then
        wget -q "$URL" -O "$DEST"
    else
        echo "Neither curl nor wget found. Please install one."
        exit 1
    fi
}

main() {
    detect_platform

    VERSION="${1:-}"
    if [ -z "$VERSION" ]; then
        echo "Fetching latest release..."
        VERSION="$(get_latest_release)"
        if [ -z "$VERSION" ]; then
            echo "Failed to determine latest version."
            exit 1
        fi
    fi

    DOWNLOAD_URL="https://github.com/${REPO}/releases/download/${VERSION}/${PLATFORM}.tar.gz"

    echo "Downloading ${BINARY_NAME} ${VERSION} for ${OS}/${ARCH}..."
    TMPDIR="$(mktemp -d)"
    trap 'rm -rf "$TMPDIR"' EXIT

    download "$DOWNLOAD_URL" "$TMPDIR/${PLATFORM}.tar.gz"

    CHECKSUMS_URL="https://github.com/${REPO}/releases/download/${VERSION}/checksums.txt"
    if download "$CHECKSUMS_URL" "$TMPDIR/checksums.txt" 2>/dev/null; then
        echo "Verifying checksum..."
        EXPECTED="$(grep "${PLATFORM}.tar.gz" "$TMPDIR/checksums.txt" | awk '{print $1}')"
        if [ -n "$EXPECTED" ]; then
            if command -v sha256sum >/dev/null 2>&1; then
                ACTUAL="$(sha256sum "$TMPDIR/${PLATFORM}.tar.gz" | awk '{print $1}')"
            elif command -v shasum >/dev/null 2>&1; then
                ACTUAL="$(shasum -a 256 "$TMPDIR/${PLATFORM}.tar.gz" | awk '{print $1}')"
            else
                echo "Warning: no sha256sum or shasum available, skipping verification."
                EXPECTED=""
            fi
            if [ "$ACTUAL" != "$EXPECTED" ]; then
                echo "Checksum mismatch! Expected ${EXPECTED}, got ${ACTUAL}"
                exit 1
            fi
        fi
    fi

    echo "Extracting..."
    mkdir -p "$INSTALL_DIR"
    tar xzf "$TMPDIR/${PLATFORM}.tar.gz" -C "$TMPDIR"
    mv "$TMPDIR/${BINARY_NAME}" "$INSTALL_DIR/${BINARY_NAME}" 2>/dev/null || \
    mv "$TMPDIR/${BINARY_NAME}.exe" "$INSTALL_DIR/${BINARY_NAME}" 2>/dev/null
    chmod +x "$INSTALL_DIR/${BINARY_NAME}"

    echo ""
    echo "Installed ${BINARY_NAME} to ${INSTALL_DIR}/${BINARY_NAME}"
    echo ""

    case ":$PATH:" in
        *":${INSTALL_DIR}:"*) ;;
        *)
            echo "Add the following to your shell profile:"
            echo ""
            echo "  export PATH=\"${INSTALL_DIR}:\$PATH\""
            echo ""
            ;;
    esac

    echo "Run '${BINARY_NAME} --help' to get started."
}

main "$@"
