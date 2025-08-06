// Mock all dependencies before importing
jest.mock('fs-extra');
jest.mock('pdf-parse', () => jest.fn());
jest.mock('inquirer');
jest.mock('chalk', () => ({
  cyan: jest.fn(text => text),
  yellow: jest.fn(text => text),
  gray: jest.fn(text => text),
  green: jest.fn(text => text),
  red: jest.fn(text => text),
  blue: jest.fn(text => text),
  magenta: jest.fn(text => text),
  bold: jest.fn(text => text),
  dim: jest.fn(text => text),
  white: jest.fn(text => text),
}));

// Mock ora for inquirer
jest.mock('ora', () => {
  return jest.fn(() => ({
    start: jest.fn().mockReturnThis(),
    succeed: jest.fn().mockReturnThis(),
    fail: jest.fn().mockReturnThis(),
    stop: jest.fn().mockReturnThis(),
  }));
});

const FileHandler = require('../src/FileHandler');
const fs = require('fs-extra');
const path = require('path');
const pdfParse = require('pdf-parse');
const inquirer = require('inquirer');
const chalk = require('chalk');

describe('FileHandler', () => {
  let fileHandler;

  beforeEach(() => {
    jest.clearAllMocks();
    fileHandler = new FileHandler();
    
    // Setup default mocks
    fs.readdir = jest.fn();
    fs.stat = jest.fn();
    fs.statSync = jest.fn();
    fs.pathExists = jest.fn();
    fs.readFile = jest.fn();
    inquirer.prompt = jest.fn();
  });

  describe('constructor', () => {
    test('should initialize with correct supported extensions and max file sizes', () => {
      expect(fileHandler.supportedExtensions).toEqual(['.txt', '.pdf']);
      expect(fileHandler.maxFileSizes).toEqual({
        '.pdf': 50 * 1024 * 1024, // 50MB
        '.txt': 1000000 * 4, // ~1M characters
      });
    });
  });

  describe('cleanFilePath', () => {
    test('should remove surrounding quotes', () => {
      expect(fileHandler.cleanFilePath('"test.pdf"')).toBe('test.pdf');
      expect(fileHandler.cleanFilePath("'test.pdf'")).toBe('test.pdf');
    });

    test('should handle escaped spaces', () => {
      expect(fileHandler.cleanFilePath('test\\ file.pdf')).toBe('test file.pdf');
    });

    test('should trim whitespace', () => {
      expect(fileHandler.cleanFilePath('  test.pdf  ')).toBe('test.pdf');
    });

    test('should handle multiple cleaning operations', () => {
      expect(fileHandler.cleanFilePath('  "test\\ file.pdf"  ')).toBe('test file.pdf');
    });
  });

  describe('formatFileSize', () => {
    test('should format bytes correctly', () => {
      fs.statSync.mockReturnValue({ size: 0 });
      expect(fileHandler.formatFileSize('/test')).toBe('0 Bytes');

      fs.statSync.mockReturnValue({ size: 1024 });
      expect(fileHandler.formatFileSize('/test')).toBe('1 KB');

      fs.statSync.mockReturnValue({ size: 1024 * 1024 });
      expect(fileHandler.formatFileSize('/test')).toBe('1 MB');

      fs.statSync.mockReturnValue({ size: 1536 }); // 1.5 KB
      expect(fileHandler.formatFileSize('/test')).toBe('1.5 KB');
    });

    test('should handle file stat errors', () => {
      fs.statSync.mockImplementation(() => {
        throw new Error('File not found');
      });

      expect(fileHandler.formatFileSize('/nonexistent')).toBe('Unknown size');
    });
  });

  describe('validateFile', () => {
    test('should validate supported file types', async () => {
      fs.stat.mockResolvedValue({ size: 1000 });

      const result = await fileHandler.validateFile('/test/file.pdf');
      expect(result.valid).toBe(true);
    });

    test('should reject unsupported file types', async () => {
      fs.stat.mockResolvedValue({ size: 1000 });

      const result = await fileHandler.validateFile('/test/file.doc');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Unsupported file type');
    });

    test('should reject files that are too large', async () => {
      // PDF larger than 50MB
      fs.stat.mockResolvedValue({ size: 60 * 1024 * 1024 });

      const result = await fileHandler.validateFile('/test/large.pdf');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('File too large');
      expect(result.error).toContain('50MB');
    });

    test('should reject text files that are too large', async () => {
      // Text file larger than ~1M characters
      fs.stat.mockResolvedValue({ size: 5000000 });

      const result = await fileHandler.validateFile('/test/large.txt');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('File too large');
      expect(result.error).toContain('1M characters');
    });

    test('should handle file access errors', async () => {
      fs.stat.mockRejectedValue(new Error('Permission denied'));

      const result = await fileHandler.validateFile('/test/file.pdf');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Cannot access file');
    });
  });

  describe('findRecentFiles', () => {
    test('should find and sort recent files by modification time', async () => {
      const mockFiles = ['file1.pdf', 'file2.txt', 'file3.doc', 'file4.pdf'];
      fs.readdir.mockResolvedValue(mockFiles);
      
      const now = new Date();
      const older = new Date(now.getTime() - 1000000);
      const newest = new Date(now.getTime() + 1000000);

      fs.stat
        .mockResolvedValueOnce({ mtime: older })    // file1.pdf
        .mockResolvedValueOnce({ mtime: now })      // file2.txt  
        .mockResolvedValueOnce({ mtime: newest });  // file4.pdf

      const result = await fileHandler.findRecentFiles('/test');

      expect(result).toHaveLength(3); // file3.doc excluded (unsupported)
      expect(result[0].name).toBe('file4.pdf'); // Most recent first
      expect(result[1].name).toBe('file2.txt');
      expect(result[2].name).toBe('file1.pdf'); // Oldest last
    });

    test('should limit results to 5 files', async () => {
      const mockFiles = Array.from({ length: 10 }, (_, i) => `file${i}.pdf`);
      fs.readdir.mockResolvedValue(mockFiles);
      
      const mockStats = { mtime: new Date() };
      fs.stat.mockResolvedValue(mockStats);

      const result = await fileHandler.findRecentFiles('/test');

      expect(result).toHaveLength(5);
    });

    test('should handle directory read errors gracefully', async () => {
      fs.readdir.mockRejectedValue(new Error('Permission denied'));

      const result = await fileHandler.findRecentFiles('/test');

      expect(result).toEqual([]);
    });

    test('should filter by supported extensions', async () => {
      const mockFiles = ['file.pdf', 'file.txt', 'file.doc', 'file.jpg'];
      fs.readdir.mockResolvedValue(mockFiles);
      
      const mockStats = { mtime: new Date() };
      fs.stat.mockResolvedValue(mockStats);

      const result = await fileHandler.findRecentFiles('/test');

      expect(result).toHaveLength(2); // Only .pdf and .txt
      expect(result.every(f => ['.pdf', '.txt'].includes(path.extname(f.name)))).toBe(true);
    });
  });

  describe('readTextFile', () => {
    test('should read and process text file correctly', async () => {
      const content = 'This is a test file with some content.';
      fs.readFile.mockResolvedValue(content);

      const result = await fileHandler.readTextFile('/test/file.txt');

      expect(result).toEqual({
        content: content.trim(),
        characterCount: content.length,
        wordCount: 8,
        type: 'text',
      });
    });

    test('should handle empty text files', async () => {
      fs.readFile.mockResolvedValue('');

      await expect(fileHandler.readTextFile('/test/empty.txt')).rejects.toThrow('File is empty');
    });

    test('should handle text files that are too large', async () => {
      const largeContent = 'x'.repeat(5000000); // 5M characters
      fs.readFile.mockResolvedValue(largeContent);

      await expect(fileHandler.readTextFile('/test/large.txt')).rejects.toThrow(
        'Text file too large (exceeds 1M characters)'
      );
    });

    test('should trim whitespace from content', async () => {
      const content = '   Some content with whitespace   ';
      fs.readFile.mockResolvedValue(content);

      const result = await fileHandler.readTextFile('/test/file.txt');

      expect(result.content).toBe('Some content with whitespace');
    });
  });

  describe('readPdfFile', () => {
    test('should read and process PDF file correctly', async () => {
      const mockBuffer = Buffer.from('mock pdf data');
      const mockPdfData = {
        text: 'This is extracted PDF text content.',
        numpages: 5,
      };

      fs.readFile.mockResolvedValue(mockBuffer);
      pdfParse.mockResolvedValue(mockPdfData);

      const result = await fileHandler.readPdfFile('/test/file.pdf');

      expect(pdfParse).toHaveBeenCalledWith(mockBuffer);
      expect(result).toEqual({
        content: mockPdfData.text.trim(),
        characterCount: mockPdfData.text.length,
        wordCount: 6,
        pageCount: 5,
        type: 'pdf',
      });
    });

    test('should handle PDFs with no readable text', async () => {
      const mockBuffer = Buffer.from('mock pdf data');
      pdfParse.mockResolvedValue({ text: '', numpages: 1 });
      fs.readFile.mockResolvedValue(mockBuffer);

      await expect(fileHandler.readPdfFile('/test/empty.pdf')).rejects.toThrow(
        'PDF contains no readable text'
      );
    });

    test('should handle PDFs with only whitespace', async () => {
      const mockBuffer = Buffer.from('mock pdf data');
      pdfParse.mockResolvedValue({ text: '   \n\t   ', numpages: 1 });
      fs.readFile.mockResolvedValue(mockBuffer);

      await expect(fileHandler.readPdfFile('/test/whitespace.pdf')).rejects.toThrow(
        'PDF contains no readable text'
      );
    });
  });

  describe('readFile', () => {
    test('should delegate to readTextFile for .txt files', async () => {
      const mockResult = { content: 'test', type: 'text' };
      fileHandler.readTextFile = jest.fn().mockResolvedValue(mockResult);

      const result = await fileHandler.readFile('/test/file.txt');

      expect(fileHandler.readTextFile).toHaveBeenCalledWith('/test/file.txt');
      expect(result).toBe(mockResult);
    });

    test('should delegate to readPdfFile for .pdf files', async () => {
      const mockResult = { content: 'test', type: 'pdf' };
      fileHandler.readPdfFile = jest.fn().mockResolvedValue(mockResult);

      const result = await fileHandler.readFile('/test/file.pdf');

      expect(fileHandler.readPdfFile).toHaveBeenCalledWith('/test/file.pdf');
      expect(result).toBe(mockResult);
    });

    test('should throw error for unsupported file types', async () => {
      await expect(fileHandler.readFile('/test/file.doc')).rejects.toThrow(
        'Unsupported file type: .doc'
      );
    });

    test('should wrap and re-throw file reading errors', async () => {
      fileHandler.readTextFile = jest.fn().mockRejectedValue(new Error('Read error'));

      await expect(fileHandler.readFile('/test/file.txt')).rejects.toThrow(
        'Failed to read file: Read error'
      );
    });
  });

  describe('splitTextIntoChunks', () => {
    test('should return single chunk if text is within limit', () => {
      const text = 'Short text';
      const result = fileHandler.splitTextIntoChunks(text, 2000);

      expect(result).toEqual([text]);
    });

    test('should split text by sentences', () => {
      const longSentence = 'A'.repeat(800) + '. ';
      const text = longSentence.repeat(5); // Create text > 2000 chars
      const result = fileHandler.splitTextIntoChunks(text, 2000);

      expect(result.length).toBeGreaterThan(1);
      expect(result.every(chunk => chunk.length <= 2000)).toBe(true);
    });

    test('should handle very long sentences by splitting words', () => {
      const longText = 'word '.repeat(500); // Create long text without sentence breaks
      const result = fileHandler.splitTextIntoChunks(longText, 1500);

      expect(result.length).toBeGreaterThan(1);
      expect(result.every(chunk => chunk.length <= 1500)).toBe(true);
    });

    test('should preserve sentence punctuation', () => {
      const text = 'First sentence. Second sentence!';
      const result = fileHandler.splitTextIntoChunks(text, 2000);

      expect(result.some(chunk => chunk.includes('.'))).toBe(true);
    });

    test('should filter out empty chunks', () => {
      const text = 'Sentence one. . . Sentence two.';
      const result = fileHandler.splitTextIntoChunks(text, 2000);

      expect(result.every(chunk => chunk.length > 0)).toBe(true);
    });

    test('should use default chunk size of 4000', () => {
      const text = 'Test text';
      
      // Test that when no maxChunkSize is provided, it uses the default of 4000
      // by verifying the behavior is the same as explicitly passing 4000
      const resultDefault = fileHandler.splitTextIntoChunks(text);
      const resultExplicit = fileHandler.splitTextIntoChunks(text, 4000);
      
      expect(resultDefault).toEqual(resultExplicit);
    });
  });

  describe('calculateCost', () => {
    test('should calculate cost correctly for text', () => {
      const text = 'a'.repeat(2000); // 2000 characters
      const result = fileHandler.calculateCost(text);

      expect(result).toEqual({
        characterCount: 2000,
        estimatedCost: 0.03, // (2000 / 1000) * 0.015
        chunks: 1, // Math.ceil(2000 / 4000)
      });
    });

    test('should calculate multiple chunks correctly', () => {
      const text = 'a'.repeat(10000); // 10000 characters
      const result = fileHandler.calculateCost(text);

      expect(result).toEqual({
        characterCount: 10000,
        estimatedCost: 0.15, // (10000 / 1000) * 0.015
        chunks: 3, // Math.ceil(10000 / 4000)
      });
    });

    test('should use default model when not specified', () => {
      const text = 'test';
      const result = fileHandler.calculateCost(text);

      expect(result.characterCount).toBe(4);
      expect(typeof result.estimatedCost).toBe('number');
    });

    test('should handle empty text', () => {
      const result = fileHandler.calculateCost('');

      expect(result).toEqual({
        characterCount: 0,
        estimatedCost: 0,
        chunks: 0,
      });
    });
  });

  describe('selectFromRecentFiles', () => {
    test('should present recent files with size information', async () => {
      const recentFiles = [
        { name: 'file1.pdf', path: '/test/file1.pdf' },
        { name: 'file2.txt', path: '/test/file2.txt' },
      ];

      fileHandler.formatFileSize = jest.fn()
        .mockReturnValueOnce('1.5 MB')
        .mockReturnValueOnce('2 KB');

      inquirer.prompt.mockResolvedValue({ selectedFile: '/test/file1.pdf' });

      const result = await fileHandler.selectFromRecentFiles(recentFiles);

      expect(inquirer.prompt).toHaveBeenCalledWith([
        expect.objectContaining({
          choices: expect.arrayContaining([
            { name: 'file1.pdf (1.5 MB)', value: '/test/file1.pdf' },
            { name: 'file2.txt (2 KB)', value: '/test/file2.txt' },
            { name: '🔙 Back', value: 'back' },
          ]),
        }),
      ]);
      expect(result).toBe('/test/file1.pdf');
    });

    test('should handle back selection', async () => {
      inquirer.prompt.mockResolvedValue({ selectedFile: 'back' });

      const result = await fileHandler.selectFromRecentFiles([]);

      expect(result).toBeNull();
    });
  });
});