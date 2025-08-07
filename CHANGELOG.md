# Changelog

All notable changes to AI Audiobook Maker will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [5.1.0] - 2025-08-07

### Added
- 🎨 **Enhanced UI/UX System**: Complete overhaul of user interface with new UIHelpers module
  - Beautiful welcome banners with helpful tips
  - Enhanced menu choices with descriptive options
  - Advanced progress bars with visual feedback
  - Processing stages display with progress visualization
  - Improved error/success messages with suggestions
  - Context-aware help content system
- ⬇️ **Downloads folder as default output location**: More convenient default output path
- 📁 **Flexible output options**: Option to save directly to chosen folder without creating subfolder
- 🚀 **Improved path handling**: Better support for relative paths (e.g., "Downloads", "Desktop")

### Changed
- 🔧 **Optimized Thorsten-Voice loading**: Model now loads only once and caches result
- 📊 **Better processing summaries**: Enhanced file info display with comprehensive details
- 🎯 **Smarter default settings**: Downloads folder as default, subfolder creation optional

### Fixed
- 🐛 Fixed redundant model initialization during Thorsten-Voice selection
- 🐛 Fixed output directory always creating subfolders even when not desired
- 🐛 Fixed integration tests expecting non-existent constructor parameters

## [5.0.3] - 2025-08-05

### Added
- Comprehensive security utilities (API key validation, input sanitization)
- Enhanced test coverage with unit tests for SecurityUtils and FileHandler
- Zod schema validation for type-safe configurations

### Changed
- Updated README with v5.0.3 features
- Improved error handling and validation

### Fixed
- Linting errors (41 total) including unused variables and missing imports
- Variable redeclaration issues in cli.js
- Test failures due to mocking issues

## [5.0.0] - 2025-08-01

### Added
- Multi-provider TTS support (OpenAI, Thorsten-Voice)
- Session management and progress tracking
- Voice preview functionality
- Cost estimation features

### Changed
- Complete architectural overhaul
- Modular service-based design
- Enhanced error handling

### Breaking Changes
- New CLI interface
- Changed configuration structure
- Updated API key management

## [4.0.8] - 2025-07-20

### Fixed
- FFmpeg hanging issue for single audio files
- Multiline text processing with Base64 encoding

## Previous Versions

For versions prior to 4.0.8, please refer to the git history.