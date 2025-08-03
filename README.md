# 🎧 AI Audiobook Maker (AIABM) v4.0.3

[![npm version](https://img.shields.io/npm/v/aiabm.svg)](https://www.npmjs.com/package/aiabm)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js Version](https://img.shields.io/node/v/ai-audiobook-maker.svg)](https://nodejs.org)

Transform your PDFs and text files into high-quality audiobooks using **OpenAI TTS** (cloud), **Fish Speech** (local/SOTA), or **Thorsten-Voice** (native German). Choose between premium cloud voices or run everything locally at no cost!

## ✨ Features

### 🎙️ **Triple TTS Providers**
- **☁️ OpenAI TTS**: Premium cloud voices (requires API key)
- **🐟 Fish Speech**: State-of-the-art local TTS with multilingual support
- **🇩🇪 Thorsten-Voice**: Native German TTS with authentic pronunciation

### 🚀 **Core Features**
- **🚀 Zero Installation**: Run directly with `npx aiabm`
- **📁 Smart File Handling**: Supports PDF and TXT files with drag & drop
- **🎤 Voice Preview**: Listen to voices before choosing (8 Fish Speech + 2 Thorsten + 6 OpenAI)
- **⏸️ Resume & Pause**: Continue interrupted conversions anytime
- **🔐 Secure API Key Management**: Encrypted local storage
- **📊 Progress Tracking**: Real-time conversion progress with estimates
- **🎛️ Advanced Controls**: Adjust speed, quality, and output format
- **💰 Cost Transparency**: See exact pricing (OpenAI) or run free (local providers)
- **🔧 Smart Installation**: Automatic setup for local TTS providers

## 🚀 Quick Start

### Method 1: Direct Usage (Recommended)
```bash
# Convert a specific file
npx aiabm mybook.pdf

# Interactive mode
npx aiabm
```

### Method 2: Global Installation
```bash
npm install -g aiabm
aiabm mybook.pdf
```

## 📋 Prerequisites

### Required
- **Node.js 16+** (Download from [nodejs.org](https://nodejs.org/))
- **FFmpeg** (for audio combining - auto-installed on most systems)

### Optional (Choose One or More)
- **OpenAI API Key** (Get from [platform.openai.com](https://platform.openai.com/account/api-keys)) - For cloud TTS
- **Python 3.8+** (For Fish Speech local processing) - For multilingual local TTS
- **Python 3.9-3.11** (For Thorsten-Voice) - For native German TTS

## 🎯 Usage Examples

### CLI Mode
```bash
# Basic conversion
npx aiabm document.pdf

# With specific options (OpenAI)
npx aiabm book.txt --voice nova --speed 1.2 --model tts-1-hd

# Manage API key
npx aiabm --config
```

### Interactive Mode
```bash
npx aiabm
```
Then follow the interactive prompts to:
1. **Select TTS Provider** (OpenAI, Fish Speech, or Thorsten-Voice)
2. **Auto-install local providers** if needed (one-time setup)
3. **Select your file** (browse, drag & drop, or enter path)
4. **Preview and choose a voice**
5. **Configure settings** (speed, quality, output format)
6. **Monitor progress** and resume if needed

## 🎤 Available Voices

### 🤖 OpenAI TTS (Cloud)
- **Alloy**: Neutral, versatile
- **Echo**: Clear, professional
- **Fable**: Warm, storytelling
- **Onyx**: Deep, authoritative  
- **Nova**: Bright, engaging
- **Shimmer**: Gentle, soothing

### 🐟 Fish Speech (Local/Multilingual)
- **🇩🇪 German Female (Natural)**: High-quality German synthesis
- **🇩🇪 German Male (Clear)**: Professional German voice
- **🇩🇪 German Female (Expressive)**: Emotional German narration
- **🇺🇸 English Female (Warm)**: Natural English voice
- **🇺🇸 English Male (Professional)**: Business-quality English
- **🇺🇸 English Female (Energetic)**: Dynamic storytelling
- **🇫🇷 French Female (Elegant)**: Sophisticated French accent
- **🇫🇷 French Male (Sophisticated)**: Professional French voice

### 🇩🇪 Thorsten-Voice (Native German)
- **🇩🇪 Thorsten (Authentic German Male)**: High-quality native German voice
- **🇩🇪 Thorsten Emotional (German Male)**: German voice with emotional expression

## 💰 Pricing

### OpenAI TTS
**$0.015 per 1,000 characters**

| Content Length | Estimated Cost | Example |
|----------------|----------------|---------|
| 10,000 characters | ~$0.15 | Short article |
| 50,000 characters | ~$0.75 | Small e-book |
| 100,000 characters | ~$1.50 | Average novel |
| 250,000 characters | ~$3.75 | Large book |

### Fish Speech & Thorsten-Voice
**100% FREE** - No API costs, runs entirely on your machine!

## 🔧 Local TTS Setup

Both Fish Speech and Thorsten-Voice run entirely on your machine - no API costs! **Now with fully automated installation!**

### 🚀 Smart Installation (Recommended)
```bash
npx aiabm
# Select "Fish Speech" or "Thorsten-Voice"
# Choose "Auto Install (recommended)"
# → System automatically downloads and configures everything!
```

### 🐟 Fish Speech Setup
**What happens automatically:**
1. **📦 Repository Cloning** - Downloads latest Fish Speech
2. **🐍 Virtual Environment** - Creates isolated Python environment  
3. **⚡ PyTorch Installation** - Installs optimized CPU version
4. **🤖 Model Download** - Downloads Fish Speech 1.2 models (~1GB)
5. **✅ Dependency Check** - Verifies installation works

**System Requirements:**
- **Python 3.8+** recommended
- **~2GB disk space** for models and dependencies
- **4GB+ RAM** recommended  
- **CPU or GPU** (GPU faster but optional)

### 🇩🇪 Thorsten-Voice Setup
**What happens automatically:**
1. **🐍 Compatible Python Detection** - Finds Python 3.9-3.11
2. **📦 Virtual Environment** - Creates isolated environment
3. **🎤 Coqui TTS Installation** - Installs German TTS framework
4. **🤖 Thorsten Model** - Downloads German voice model (~500MB)
5. **✅ Compatibility Check** - Verifies everything works

**System Requirements:**
- **Python 3.9-3.11** (NOT 3.12+, NOT 3.13+)
- **~1GB disk space** for models and dependencies
- **2GB+ RAM** recommended

**Python Version Issues?**
```bash
# Install compatible Python on macOS
brew install python@3.11

# On Ubuntu/Debian
sudo apt install python3.11 python3.11-venv
```

### 🔧 Installation Status Tracking
- **✅ Smart Detection**: Avoids re-installation if already installed
- **📅 Version Tracking**: Shows installation date and version
- **🔄 Update Suggestions**: Recommends updates after 30+ days
- **🛠️ Installation Markers**: Persistent installation state

## 🔧 Advanced Features

### Resume Interrupted Conversions
If conversion stops, simply run the tool again - it will automatically detect and offer to resume your previous session.

### Multiple Output Formats
- **Single File**: One complete audiobook MP3
- **Chapter Files**: Separate MP3 per chunk
- **Both**: Get both formats

### Voice Preview Caching
Voice previews are cached locally to save API costs and improve performance.

### Smart Text Chunking
- Respects sentence boundaries
- Preserves chapter structure for PDFs
- Configurable chunk sizes (default: 4000 characters)

## 📂 File Support

### PDF Files
- ✅ Up to 50MB
- ✅ Text extraction with structure preservation
- ✅ Automatic chapter detection

### Text Files  
- ✅ Up to 1M characters
- ✅ UTF-8 encoding
- ✅ Automatic formatting cleanup

## ⚙️ Configuration

### API Key Storage
Your OpenAI API key is encrypted and stored locally at:
- **macOS/Linux**: `~/.config/ai-audiobook-maker/config.json`
- **Windows**: `%APPDATA%\ai-audiobook-maker\config.json`

### Cache Location
Voice previews and temporary files:
- **macOS/Linux**: `~/.config/ai-audiobook-maker/cache/`
- **Windows**: `%APPDATA%\ai-audiobook-maker\cache\`

### Local TTS Installations
Local TTS providers are installed to:
- **Fish Speech**: `~/.aiabm/fish-speech/`
- **Thorsten-Voice**: `~/.aiabm/thorsten-voice/`

## 🛠️ Troubleshooting

### Common Issues

**"FFmpeg not found"**
```bash
# macOS
brew install ffmpeg

# Ubuntu/Debian
sudo apt install ffmpeg

# Windows
# Download from https://ffmpeg.org/download.html
```

**"API key invalid"**
- Verify your key at [OpenAI Platform](https://platform.openai.com/account/api-keys)
- Use `npx aiabm --config` to update your key

**"File too large"**
- PDFs: Maximum 50MB
- Text: Maximum 1M characters
- Split large files before conversion

**"Fish Speech dependencies missing"**
- Check Python version: `python3 --version`
- Try restarting the app
- Virtual environment issues usually resolve on restart

**"Thorsten-Voice requires Python 3.9-3.11"**
- Install compatible Python: `brew install python@3.11`
- App will automatically detect and use it
- Creates separate virtual environment

**Voice preview not playing**
- macOS: Uses built-in `afplay`
- Windows: Uses PowerShell media player
- Linux: Requires `ffplay`, `mpv`, `vlc`, or `mplayer`

### Performance Tips

- Use `tts-1` model for faster processing
- Use `tts-1-hd` for higher quality (slower)
- Local TTS providers are free but slower than cloud
- Cache clears automatically after 30 days
- Resume feature prevents re-processing completed chunks

## 🔒 Privacy & Security

- API keys are encrypted locally using AES-192
- No data is sent to servers when using local TTS
- OpenAI TTS sends only text chunks to OpenAI servers
- Cache files are stored locally only
- Session data helps resume interrupted conversions
- Local TTS models run entirely offline

## 📖 Examples

### Converting a PDF Book with German Voice
```bash
npx aiabm "Mein Roman.pdf"
# Select "Thorsten-Voice"
# Choose German voice
# Enjoy authentic German pronunciation!
```

### Interactive Multilingual Setup
```bash
npx aiabm
# Select "Fish Speech"
# Auto-install if needed
# Preview German, English, and French voices
# Choose your favorite for the content language
```

### Quick OpenAI Conversion
```bash
npx aiabm document.pdf --voice nova --speed 1.1
```

## 🤝 Contributing

Issues and feature requests welcome at: [GitHub Issues](https://github.com/iamthamanic/AI-Audiobook-Maker/issues)

## 📄 License

MIT License - see LICENSE file for details

## 🙏 Acknowledgments

- Built on OpenAI's TTS API, Fish Speech, and Thorsten-Voice/Coqui TTS
- Fish Speech: https://github.com/fishaudio/fish-speech
- Thorsten-Voice: https://github.com/thorstenMueller/Thorsten-Voice
- Coqui TTS: https://github.com/coqui-ai/TTS
- Uses FFmpeg for audio processing

## 📝 Changelog

### v4.0.3 (2025-08-03) - 🔧 Fish Speech Import Fix
- 🔧 **Fixed MODDED_DAC import** - Changed to correct DAC import from inference_engine
- ✅ **Added missing torch import** - Fixed undefined torch reference in generation script
- 🛠️ **Simplified dependency check** - Import DAC directly from inference_engine
- 📦 **Better module verification** - Check ServeTTSRequest schema availability

### v4.0.2 (2025-08-03) - 🐟 Fish Speech API Update
- 🔧 **Fixed Fish Speech dependency check** - Updated to use current DAC-based architecture
- 🗑️ **Removed deprecated VQGAN imports** - Fish Speech now uses DAC (Descript Audio Codec)
- ✅ **Updated generation script** - Uses modern TTSInferenceEngine API
- 🔄 **Better installation handling** - Auto-removes incomplete installations
- 📦 **Improved pip install** - Installs Fish Speech package in development mode
- 🛠️ **Enhanced error reporting** - More detailed debugging information

### v4.0.1 (2025-08-02) - 🔧 Installation & Compatibility Fixes
- 🔧 **Fixed Fish Speech virtual environment usage** - Proper dependency checking
- 🐍 **Enhanced Python version detection** - Blocks Thorsten-Voice on Python 3.13+
- ✅ **Smart installation status tracking** - Avoids unnecessary re-installations  
- 📅 **Installation markers** - Persistent installation state with version info
- 🔄 **Better error handling** - More informative error messages and recovery
- 💡 **Improved user guidance** - Clear instructions for Python compatibility issues

### v4.0.0 (2025-08-02) - 🌟 Major Refactoring
- 🗑️ **REMOVED**: Kyutai TTS (replaced due to Python 3.13 compatibility issues)
- 🐟 **NEW**: Fish Speech integration - State-of-the-art multilingual TTS
- 🇩🇪 **NEW**: Thorsten-Voice integration - Native German TTS
- 🎤 **Enhanced Voice Selection**: 16 total voices across 3 providers
- 🏗️ **Automated Installation**: One-click setup for local TTS providers
- 🔧 **Improved Architecture**: Better service abstraction and error handling
- 📊 **Enhanced Testing**: 80%+ test coverage with Jest
- 🛠️ **Code Quality Tools**: ESLint, Prettier, Snyk integration
- 🔄 **Backward Compatibility**: 100% compatibility with existing OpenAI workflows

### v3.3.0 (2025-08-01) - 🚀 Kyutai Integration (Deprecated)
- 🆓 Kyutai TTS integration (now removed in v4.0.0)
- 🏗️ Automated installation system
- 🎤 15+ voice options
- 🔄 Provider selection system

---

**Happy listening! 🎧** Turn any text into your personal audiobook library with the best TTS technology available.