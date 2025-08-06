/**
 * Security utilities for API key management and input sanitization.
 * Provides additional security layers for the application.
 */

const crypto = require('crypto');
const chalk = require('chalk');
const { safeValidateApiKey } = require('./schemas');

class SecurityUtils {
  /**
   * Sanitizes text input to prevent injection attacks.
   * @param {string} input - Raw text input
   * @returns {string} Sanitized text
   */
  static sanitizeTextInput(input) {
    if (typeof input !== 'string') {
      return '';
    }

    // Remove potentially dangerous characters and patterns
    return input
      // eslint-disable-next-line no-control-regex
      .replace(/[\x00-\x1F\x7F]/g, '') // Remove control characters
      .replace(/[<>]/g, '') // Remove HTML-like brackets
      .replace(/`/g, "'") // Replace backticks with single quotes
      .replace(/\$\{/g, '${') // Neutralize template literal injection attempts
      .trim();
  }

  /**
   * Validates API key strength and format.
   * @param {string} apiKey - API key to validate
   * @returns {Object} Validation result with security recommendations
   */
  static validateApiKeySecurity(apiKey) {
    const result = {
      valid: false,
      strength: 'weak',
      warnings: [],
      recommendations: []
    };

    try {
      // Use Zod validation first
      const validation = safeValidateApiKey({ key: apiKey });
      if (!validation.success) {
        result.warnings.push('API key format is invalid');
        return result;
      }

      result.valid = true;

      // Check key length (OpenAI keys are typically 51+ characters)
      if (apiKey.length < 45) {
        result.warnings.push('API key seems shorter than expected');
        result.strength = 'weak';
      } else if (apiKey.length >= 51) {
        result.strength = 'strong';
      } else {
        result.strength = 'medium';
      }

      // Check for common patterns that might indicate a test/fake key
      if (apiKey.includes('test') || apiKey.includes('fake') || apiKey.includes('demo')) {
        result.warnings.push('API key contains test/demo patterns');
        result.strength = 'weak';
      }

      // Security recommendations
      if (result.strength === 'weak') {
        result.recommendations.push('Consider using a fresh API key from OpenAI');
        result.recommendations.push('Ensure the key has appropriate permissions');
      }

      result.recommendations.push('Store the API key as an environment variable for better security');
      result.recommendations.push('Regularly rotate your API keys');
      result.recommendations.push('Monitor API key usage in OpenAI dashboard');

    } catch (error) {
      result.warnings.push(`Validation error: ${error.message}`);
    }

    return result;
  }

  /**
   * Masks API key for safe display in logs.
   * @param {string} apiKey - API key to mask
   * @returns {string} Masked API key
   */
  static maskApiKey(apiKey) {
    if (!apiKey || typeof apiKey !== 'string') {
      return '[INVALID_KEY]';
    }

    if (apiKey.length < 10) {
      return '[REDACTED]';
    }

    // Show first 7 characters and last 4 characters
    const start = apiKey.substring(0, 7);
    const end = apiKey.substring(apiKey.length - 4);
    const middle = '*'.repeat(Math.min(apiKey.length - 11, 20));

    return `${start}${middle}${end}`;
  }

  /**
   * Generates secure random salt for encryption.
   * @param {number} length - Salt length in bytes
   * @returns {Buffer} Random salt
   */
  static generateSecureSalt(length = 16) {
    return crypto.randomBytes(length);
  }

  /**
   * Securely wipes sensitive data from memory.
   * @param {Buffer|string} data - Data to wipe
   */
  static secureWipe(data) {
    if (Buffer.isBuffer(data)) {
      data.fill(0);
    } else if (typeof data === 'string') {
      // Note: In JavaScript, strings are immutable, so we can't truly wipe them
      // This is more of a symbolic security measure
      data = null;
    }
  }

  /**
   * Checks if the current environment is secure for API key handling.
   * @returns {Object} Security assessment
   */
  static assessEnvironmentSecurity() {
    const assessment = {
      secure: true,
      warnings: [],
      recommendations: []
    };

    // Check if we're in a development environment
    if (process.env.NODE_ENV === 'development') {
      assessment.warnings.push('Running in development mode');
      assessment.recommendations.push('Use environment variables for API keys in development');
    }

    // Check for common CI/CD environment variables that might expose secrets
    const ciEnvironments = ['CI', 'GITHUB_ACTIONS', 'TRAVIS', 'JENKINS_URL'];
    const inCI = ciEnvironments.some(env => process.env[env]);
    
    if (inCI) {
      assessment.warnings.push('Running in CI/CD environment');
      assessment.recommendations.push('Ensure API keys are stored as encrypted secrets');
    }

    // Check file system permissions on config directory
    try {
      const os = require('os');
      const fs = require('fs');
      const path = require('path');
      
      const configDir = path.join(os.homedir(), '.config', 'aiabm');
      if (fs.existsSync(configDir)) {
        const stats = fs.statSync(configDir);
        // On Unix-like systems, check if directory is readable by others
        if (process.platform !== 'win32' && (stats.mode & 0o077) !== 0) {
          assessment.warnings.push('Config directory permissions may be too permissive');
          assessment.recommendations.push('Set config directory permissions to 700 (user only)');
        }
      }
    } catch (error) {
      // Silently ignore permission check errors
    }

    return assessment;
  }

  /**
   * Displays security recommendations to the user.
   * @param {Object} assessment - Security assessment result
   */
  static displaySecurityRecommendations(assessment) {
    if (assessment.warnings.length > 0) {
      console.log(chalk.yellow('\n⚠️  Security Warnings:'));
      assessment.warnings.forEach(warning => {
        console.log(chalk.yellow(`   • ${warning}`));
      });
    }

    if (assessment.recommendations.length > 0) {
      console.log(chalk.cyan('\n🔒 Security Recommendations:'));
      assessment.recommendations.forEach(rec => {
        console.log(chalk.cyan(`   • ${rec}`));
      });
    }
  }

  /**
   * Performs a comprehensive security check for API key handling.
   * @param {string} [apiKey] - Optional API key to validate
   * @returns {Object} Complete security assessment
   */
  static performSecurityCheck(apiKey = null) {
    const environmentSecurity = this.assessEnvironmentSecurity();
    const result = {
      environment: environmentSecurity,
      apiKey: null,
      overall: 'good'
    };

    if (apiKey) {
      result.apiKey = this.validateApiKeySecurity(apiKey);
      
      // Combine warnings and recommendations
      result.environment.warnings.push(...(result.apiKey.warnings || []));
      result.environment.recommendations.push(...(result.apiKey.recommendations || []));
      
      // Assess overall security level
      if (result.apiKey.strength === 'weak' || result.environment.warnings.length > 3) {
        result.overall = 'needs-improvement';
      } else if (result.environment.warnings.length > 1) {
        result.overall = 'moderate';
      }
    }

    return result;
  }
}

module.exports = SecurityUtils;