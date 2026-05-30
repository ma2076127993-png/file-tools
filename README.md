# File Tools

A lightweight file conversion toolbox for web and mobile. It provides a simple interface for common conversion tasks, including image formats, document formats, audio formats, and image-to-PDF workflows.

## Features

- Smart file detection after upload
- Image conversion options for common formats such as PNG, JPG, WebP, BMP, and GIF
- Document conversion entry points for Word, PDF, Excel, PPT, and related formats
- Audio conversion entry points for common formats such as MP3, WAV, FLAC, AAC, M4A, OGG, OPUS, WMA, and AIFF
- Multi-image to single PDF conversion in selected order
- Mobile-friendly interface and Android WebView app source
- Update metadata file for app version checks

## Project Structure

```text
uni-preset-vue-vite/uni-preset-vue-vite/
  src/                         UniApp source
  android-webview/             Android WebView app source
  public/                      Public web assets
  image-tools.html             Desktop web tool page
  mobile.html                  Mobile web tool page
  word-to-pdf-server.js        Local conversion API server
  pdf_converter.py             PDF conversion helper
  app-update.json              App update metadata template
```

## Getting Started

Install dependencies:

```bash
cd uni-preset-vue-vite/uni-preset-vue-vite
npm install
```

Run the web app:

```bash
npm run dev:h5
```

Run the local conversion API:

```bash
npm run dev:server
```

Build the web app:

```bash
npm run build:h5
```

## Configuration

This repository uses placeholder URLs by default. Before deploying, configure your own API domain and app download URL in your private deployment environment.

Do not commit production secrets, server IPs, private keys, payment credentials, database passwords, generated APK files, or deployment-specific config files.

## Notes

Some conversion features require local system dependencies or server-side tools depending on the deployment environment. Keep generated files and build outputs out of Git.
