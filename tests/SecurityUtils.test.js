/**
 * Unit Tests for SecurityUtils
 * Fast, focused tests for security utility functions
 */

const SecurityUtils = require('../src/SecurityUtils');

describe('SecurityUtils', () => {
  describe('sanitizeTextInput', () => {
    test('should remove control characters', () => {
      const input = 'Hello\x00\x1F\x7FWorld';
      const result = SecurityUtils.sanitizeTextInput(input);
      expect(result).toBe('HelloWorld');
    });

    test('should remove HTML-like brackets', () => {
      const input = '<script>alert("xss")</script>Hello';
      const result = SecurityUtils.sanitizeTextInput(input);
      expect(result).toBe('scriptalert("xss")/scriptHello');
    });

    test('should replace backticks with single quotes', () => {
      const input = 'Hello `world`';
      const result = SecurityUtils.sanitizeTextInput(input);
      expect(result).toBe("Hello 'world'");
    });

    test('should handle empty strings', () => {
      expect(SecurityUtils.sanitizeTextInput('')).toBe('');
    });

    test('should handle non-string input', () => {
      expect(SecurityUtils.sanitizeTextInput(123)).toBe('');
      expect(SecurityUtils.sanitizeTextInput(null)).toBe('');
      expect(SecurityUtils.sanitizeTextInput(undefined)).toBe('');
    });
  });

  describe('validateApiKeySecurity', () => {
    test('should validate strong API key', () => {
      const strongKey = 'sk-1234567890abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
      const result = SecurityUtils.validateApiKeySecurity(strongKey);
      
      expect(result.valid).toBe(true);
      expect(result.strength).toBe('strong');
      expect(result.warnings).toEqual([]);
    });

    test('should detect weak API keys', () => {
      const weakKey = 'sk-test123456789012345678901234567890'; // Make it long enough
      const result = SecurityUtils.validateApiKeySecurity(weakKey);
      
      expect(result.valid).toBe(true);
      expect(result.strength).toBe('weak');
      expect(result.warnings).toContain('API key contains test/demo patterns');
    });

    test('should handle invalid API key format', () => {
      const invalidKey = 'invalid-key-format';
      const result = SecurityUtils.validateApiKeySecurity(invalidKey);
      
      expect(result.valid).toBe(false);
      expect(result.warnings).toContain('API key format is invalid');
    });
  });

  describe('maskApiKey', () => {
    test('should mask long API keys correctly', () => {
      const apiKey = 'sk-1234567890abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
      const masked = SecurityUtils.maskApiKey(apiKey);
      
      expect(masked).toMatch(/^sk-1234.*WXYZ$/);
      expect(masked).toContain('*');
    });

    test('should handle short API keys', () => {
      const shortKey = 'sk-test';
      const masked = SecurityUtils.maskApiKey(shortKey);
      
      expect(masked).toBe('[REDACTED]');
    });

    test('should handle invalid input', () => {
      expect(SecurityUtils.maskApiKey(null)).toBe('[INVALID_KEY]');
      expect(SecurityUtils.maskApiKey('')).toBe('[INVALID_KEY]');
      expect(SecurityUtils.maskApiKey(123)).toBe('[INVALID_KEY]');
    });
  });

  describe('assessEnvironmentSecurity', () => {
    const originalEnv = process.env;

    afterEach(() => {
      process.env = originalEnv;
    });

    test('should detect development environment', () => {
      process.env = { ...originalEnv, NODE_ENV: 'development' };
      const assessment = SecurityUtils.assessEnvironmentSecurity();
      
      expect(assessment.warnings).toContain('Running in development mode');
      expect(assessment.recommendations).toContain('Use environment variables for API keys in development');
    });

    test('should detect CI environment', () => {
      process.env = { ...originalEnv, CI: 'true' };
      const assessment = SecurityUtils.assessEnvironmentSecurity();
      
      expect(assessment.warnings).toContain('Running in CI/CD environment');
      expect(assessment.recommendations).toContain('Ensure API keys are stored as encrypted secrets');
    });

    test('should handle secure environment', () => {
      process.env = { ...originalEnv };
      delete process.env.NODE_ENV;
      delete process.env.CI;
      
      const assessment = SecurityUtils.assessEnvironmentSecurity();
      expect(assessment.secure).toBe(true);
    });
  });

  describe('performSecurityCheck', () => {
    test('should perform comprehensive security check', () => {
      const apiKey = 'sk-1234567890abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
      const result = SecurityUtils.performSecurityCheck(apiKey);
      
      expect(result).toHaveProperty('environment');
      expect(result).toHaveProperty('apiKey');
      expect(result).toHaveProperty('overall');
      expect(result.apiKey.valid).toBe(true);
    });

    test('should work without API key', () => {
      const result = SecurityUtils.performSecurityCheck();
      
      expect(result).toHaveProperty('environment');
      expect(result.apiKey).toBe(null);
      expect(result.overall).toBe('good');
    });
  });
});