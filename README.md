# 🎧 AI Audiobook Maker (AIABM)

[![npm version](https://img.shields.io/npm/v/aiabm.svg)](https://www.npmjs.com/package/aiabm)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js Version](https://img.shields.io/node/v/ai-audiobook-maker.svg)](https://nodejs.org)

Transform your PDFs and text files into high-quality audiobooks using **OpenAI TTS** (cloud) or **Kyutai TTS** (local/free). Choose between premium cloud voices or run everything locally at no cost!

## ✨ Features

### 🎙️ **Dual TTS Providers**
- **☁️ OpenAI TTS**: Premium cloud voices (requires API key)
- **🆓 Kyutai TTS**: Free local processing (no API costs)

### 🚀 **Core Features**
- **🚀 Zero Installation**: Run directly with `npx aiabm`
- **📁 Smart File Handling**: Supports PDF and TXT files with drag & drop
- **🎤 Voice Preview**: Listen to voices before choosing (15+ Kyutai + 6 OpenAI)
- **⏸️ Resume & Pause**: Continue interrupted conversions anytime
- **🔐 Secure API Key Management**: Encrypted local storage
- **📊 Progress Tracking**: Real-time conversion progress with estimates
- **🎛️ Advanced Controls**: Adjust speed, quality, and output format
- **💰 Cost Transparency**: See exact pricing (OpenAI) or run free (Kyutai)

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

### Optional (Choose One or Both)
- **OpenAI API Key** (Get from [platform.openai.com](https://platform.openai.com/account/api-keys)) - For cloud TTS
- **Python 3.10+** (For Kyutai TTS local processing) - For free local TTS

## 🎯 Usage Examples

### CLI Mode
```bash
# Basic conversion
npx aiabm document.pdf

# With specific options
npx aiabm book.txt --voice nova --speed 1.2 --model tts-1-hd

# Manage API key
npx aiabm --config
```

### Interactive Mode
```bash
npx aiabm
```
Then follow the interactive prompts to:
1. Select your file (browse, drag & drop, or enter path)
2. Preview and choose a voice
3. Configure settings (speed, quality, output format)
4. Monitor progress and resume if needed

## 🎤 Available Voices

### 🤖 OpenAI TTS (Cloud)
- **Alloy**: Neutral, versatile
- **Echo**: Clear, professional
- **Fable**: Warm, storytelling
- **Onyx**: Deep, authoritative  
- **Nova**: Bright, engaging
- **Shimmer**: Gentle, soothing

### 🆓 Kyutai TTS (Local/Free)
- **VCTK Voices**: English speakers (p225, p226, p227, etc.)
- **Expresso**: Conversational styles (Happy, Narration, Confused)
- **EARS**: Natural speech patterns (Calm, Energetic)
- **French Voices**: Native French speakers
- **Custom Cloning**: Clone any voice from audio sample

## 💰 Pricing

### OpenAI TTS
**$0.015 per 1,000 characters**

| Content Length | Estimated Cost | Example |
|----------------|----------------|---------|
| 10,000 characters | ~$0.15 | Short article |
| 50,000 characters | ~$0.75 | Small e-book |
| 100,000 characters | ~$1.50 | Average novel |
| 250,000 characters | ~$3.75 | Large book |

### Kyutai TTS
**100% FREE** - No API costs, runs entirely on your machine!

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

## 🏗️ Kyutai TTS Setup (Local/Free)

Kyutai TTS runs entirely on your machine - no API costs!

### Automatic Installation
```bash
npx aiabm
# Select "Kyutai TTS (Local, free)"
# Choose "Install Kyutai TTS automatically"
```

### Manual Installation
```bash
# Install Python 3.10+ (required)
python --version  # Must be 3.10 or higher

# Clone repository  
git clone https://github.com/kyutai-labs/delayed-streams-modeling.git ~/.aiabm/kyutai-tts/delayed-streams-modeling

# Install dependencies
cd ~/.aiabm/kyutai-tts/delayed-streams-modeling
pip install moshi torch transformers sphn sounddevice
```

### System Requirements
- **Python 3.10+** (Critical - earlier versions won't work)
- **~2GB disk space** for models and dependencies
- **4GB+ RAM** recommended
- **CPU or GPU** (GPU faster but optional)

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

**Voice preview not playing**
- macOS: Uses built-in `afplay`
- Windows: Uses PowerShell media player
- Linux: Requires `ffplay`, `mpv`, `vlc`, or `mplayer`

### Performance Tips

- Use `tts-1` model for faster processing
- Use `tts-1-hd` for higher quality (slower)
- Cache clears automatically after 30 days
- Resume feature prevents re-processing completed chunks

## 🔒 Privacy & Security

- API keys are encrypted locally using AES-192
- No data is sent to servers other than OpenAI
- Cache files are stored locally only
- Session data helps resume interrupted conversions

## 📖 Examples

### Converting a PDF Book
```bash
npx aiabm "My Great Novel.pdf"
```

### Interactive Voice Selection
```bash
npx aiabm
# Select "Preview all voices"
# Listen to each voice sample
# Choose your favorite
# Configure speed and quality
# Start conversion
```

### Batch Processing Tips
```bash
# Process multiple files
for file in *.pdf; do npx aiabm "$file" --voice nova --speed 1.1; done
```

## 🤝 Contributing

Issues and feature requests welcome at: [GitHub Issues](https://github.com/iamthamanic/AI-Audiobook-Maker/issues)

## 📄 License

MIT License - see LICENSE file for details

## 🙏 Acknowledgments

- Built on OpenAI's TTS API and Kyutai TTS
- Inspired by the original bash script version
- Uses FFmpeg for audio processing

## 📝 Changelog

### v3.2.0 (2025-08-01)
- 🆓 **NEW**: Kyutai TTS integration - 100% free local text-to-speech!
- 🎤 **15+ New Voices**: VCTK, Expresso, EARS, and French voice datasets
- 🏗️ **Auto Installation**: Automatic Kyutai setup with dependency management
- 🔄 **Provider Selection**: Choose between OpenAI (cloud) or Kyutai (local)
- 🎯 **Voice Cloning**: Support for custom voice cloning (Kyutai)
- 📊 **Enhanced UI**: Updated startup banner and provider selection
- 🔧 **Improved Error Handling**: Better dependency detection and user guidance
- 🌍 **Multilingual**: Added French TTS support via Kyutai

### v2.0.1 (2025-07-31)
- 🔧 Fixed CLI command back to `aiabm` as originally intended
- 📝 Updated documentation to reflect correct command usage

### v2.0.0 (2025-07-31)
- 🎨 Renamed npm package to `ai-audiobook-maker` for better discoverability
- ⌨️  CLI command remains `aiabm` for convenience
- 📦 Improved package structure and metadata
- 🔧 Added proper .gitignore and .npmignore files
- 📄 Added MIT LICENSE file
- 📚 Updated documentation and installation instructions
- 🚀 Ready for npm publishing

---

**Happy listening! 🎧** Turn any text into your personal audiobook library.