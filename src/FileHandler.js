const fs = require('fs-extra');
const path = require('path');
const pdfParse = require('pdf-parse');
const inquirer = require('inquirer');
const chalk = require('chalk');

class FileHandler {
  constructor() {
    this.supportedExtensions = ['.txt', '.pdf'];
    this.maxFileSizes = {
      '.pdf': 50 * 1024 * 1024, // 50MB
      '.txt': 1000000 * 4, // ~1M characters (assuming 4 bytes per char max)
    };
  }

  async selectFile() {
    console.log(chalk.cyan('\n📁 File Selection'));
    console.log(
      chalk.gray('Supported formats: PDF, TXT (up to 50MB for PDF, 1M characters for TXT)\n')
    );

    // Check if there are recent files in the current directory
    const currentDir = process.cwd();
    const recentFiles = await this.findRecentFiles(currentDir);

    const choices = [
      { name: '📂 Browse for file', value: 'browse' },
      ...(recentFiles.length > 0 ? [{ name: '📋 Select from recent files', value: 'recent' }] : []),
      { name: '✏️  Enter file path manually', value: 'manual' },
      { name: '🔙 Back to main menu', value: 'back' },
    ];

    const { method } = await inquirer.prompt([
      {
        type: 'list',
        name: 'method',
        message: 'How would you like to select your file?',
        choices,
      },
    ]);

    switch (method) {
      case 'browse':
        return await this.browseForFile();
      case 'recent':
        return await this.selectFromRecentFiles(recentFiles);
      case 'manual':
        return await this.enterFilePathManually();
      case 'back':
        return null;
    }
  }

  async findRecentFiles(dir) {
    try {
      const files = await fs.readdir(dir);
      const fileStats = await Promise.all(
        files
          .filter((file) => this.supportedExtensions.includes(path.extname(file).toLowerCase()))
          .map(async (file) => {
            const filePath = path.join(dir, file);
            const stats = await fs.stat(filePath);
            return { name: file, path: filePath, mtime: stats.mtime };
          })
      );

      return fileStats.sort((a, b) => b.mtime - a.mtime).slice(0, 5);
    } catch (error) {
      return [];
    }
  }

  async selectFromRecentFiles(recentFiles) {
    const choices = recentFiles.map((file) => ({
      name: `${file.name} (${this.formatFileSize(file.path)})`,
      value: file.path,
    }));

    choices.push({ name: '🔙 Back', value: 'back' });

    const { selectedFile } = await inquirer.prompt([
      {
        type: 'list',
        name: 'selectedFile',
        message: 'Select a file:',
        choices,
      },
    ]);

    if (selectedFile === 'back') return null;
    return selectedFile;
  }

  async browseForFile() {
    console.log(chalk.yellow('\n💡 Tip: You can also drag and drop a file into this terminal!'));
    console.log(chalk.gray('Or press Ctrl+C to cancel\n'));

    // Simple file path input with drag & drop support
    const { filePath } = await inquirer.prompt([
      {
        type: 'input',
        name: 'filePath',
        message: 'Drop file here or enter path:',
        validate: async (input) => {
          if (!input) return 'Please provide a file path';

          // Clean up the path (remove quotes, etc.)
          const cleanPath = this.cleanFilePath(input);

          if (!(await fs.pathExists(cleanPath))) {
            return 'File does not exist';
          }

          const validation = await this.validateFile(cleanPath);
          if (!validation.valid) {
            return validation.error;
          }

          return true;
        },
        filter: (input) => this.cleanFilePath(input),
      },
    ]);

    return filePath;
  }

  async enterFilePathManually() {
    const { filePath } = await inquirer.prompt([
      {
        type: 'input',
        name: 'filePath',
        message: 'Enter file path:',
        validate: async (input) => {
          if (!input) return 'Please provide a file path';

          const cleanPath = this.cleanFilePath(input);

          if (!(await fs.pathExists(cleanPath))) {
            return 'File does not exist';
          }

          const validation = await this.validateFile(cleanPath);
          if (!validation.valid) {
            return validation.error;
          }

          return true;
        },
        filter: (input) => this.cleanFilePath(input),
      },
    ]);

    return filePath;
  }

  cleanFilePath(input) {
    // Remove quotes and clean up the path
    return input
      .trim()
      .replace(/^["']|["']$/g, '') // Remove surrounding quotes
      .replace(/\\ /g, ' '); // Handle escaped spaces
  }

  formatFileSize(filePath) {
    try {
      const stats = fs.statSync(filePath);
      const bytes = stats.size;

      if (bytes === 0) return '0 Bytes';

      const k = 1024;
      const sizes = ['Bytes', 'KB', 'MB', 'GB'];
      const i = Math.floor(Math.log(bytes) / Math.log(k));

      return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    } catch (error) {
      return 'Unknown size';
    }
  }

  async validateFile(filePath) {
    try {
      const stats = await fs.stat(filePath);
      const ext = path.extname(filePath).toLowerCase();

      if (!this.supportedExtensions.includes(ext)) {
        return {
          valid: false,
          error: `Unsupported file type. Supported: ${this.supportedExtensions.join(', ')}`,
        };
      }

      const maxSize = this.maxFileSizes[ext];
      if (stats.size > maxSize) {
        const maxSizeFormatted = ext === '.pdf' ? '50MB' : '1M characters';
        return {
          valid: false,
          error: `File too large. Maximum size for ${ext.toUpperCase()}: ${maxSizeFormatted}`,
        };
      }

      return { valid: true };
    } catch (error) {
      return {
        valid: false,
        error: `Cannot access file: ${error.message}`,
      };
    }
  }

  async readFile(filePath) {
    const ext = path.extname(filePath).toLowerCase();

    try {
      switch (ext) {
        case '.txt':
          return await this.readTextFile(filePath);
        case '.pdf':
          return await this.readPdfFile(filePath);
        default:
          throw new Error(`Unsupported file type: ${ext}`);
      }
    } catch (error) {
      throw new Error(`Failed to read file: ${error.message}`);
    }
  }

  async readTextFile(filePath) {
    const content = await fs.readFile(filePath, 'utf-8');

    if (content.length === 0) {
      throw new Error('File is empty');
    }

    if (content.length > this.maxFileSizes['.txt'] / 4) {
      throw new Error('Text file too large (exceeds 1M characters)');
    }

    return {
      content: content.trim(),
      characterCount: content.length,
      wordCount: content.split(/\s+/).filter((word) => word.length > 0).length,
      type: 'text',
    };
  }

  async readPdfFile(filePath) {
    const dataBuffer = await fs.readFile(filePath);
    const data = await pdfParse(dataBuffer);

    if (!data.text || data.text.trim().length === 0) {
      throw new Error('PDF contains no readable text');
    }

    const content = data.text.trim();

    return {
      content,
      characterCount: content.length,
      wordCount: content.split(/\s+/).filter((word) => word.length > 0).length,
      pageCount: data.numpages,
      type: 'pdf',
    };
  }

  splitTextIntoChunks(text, maxChunkSize = 4000) {
    if (text.length <= maxChunkSize) {
      return [text];
    }

    const chunks = [];
    let currentChunk = '';
    const sentences = text.split(/[.!?]+/);

    for (let sentence of sentences) {
      sentence = sentence.trim();
      if (!sentence) continue;

      // Add sentence back the punctuation
      sentence += '.';

      if (currentChunk.length + sentence.length + 1 <= maxChunkSize) {
        currentChunk += (currentChunk ? ' ' : '') + sentence;
      } else {
        if (currentChunk) {
          chunks.push(currentChunk.trim());
          currentChunk = sentence;
        } else {
          // Single sentence is too long, split by words
          const words = sentence.split(' ');
          let wordChunk = '';

          for (const word of words) {
            if (wordChunk.length + word.length + 1 <= maxChunkSize) {
              wordChunk += (wordChunk ? ' ' : '') + word;
            } else {
              if (wordChunk) chunks.push(wordChunk.trim());
              wordChunk = word;
            }
          }

          if (wordChunk) currentChunk = wordChunk;
        }
      }
    }

    if (currentChunk) {
      chunks.push(currentChunk.trim());
    }

    return chunks.filter((chunk) => chunk.length > 0);
  }

  calculateCost(text, model = 'tts-1') {
    const charCount = text.length;
    const costPerThousand = 0.015; // $0.015 per 1K characters
    return {
      characterCount: charCount,
      estimatedCost: (charCount / 1000) * costPerThousand,
      chunks: Math.ceil(charCount / 4000),
    };
  }
}

module.exports = FileHandler;
