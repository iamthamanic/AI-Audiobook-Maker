const fs = require('fs-extra');
const path = require('path');
const crypto = require('crypto');
const chalk = require('chalk');
const inquirer = require('inquirer');

class ProgressManager {
  constructor(configDir) {
    this.progressDir = path.join(configDir, 'progress');
    this.sessionsFile = path.join(this.progressDir, 'sessions.json');
  }

  async initialize() {
    await fs.ensureDir(this.progressDir);
    
    if (!await fs.pathExists(this.sessionsFile)) {
      await this.saveSessions({});
    }
  }

  async createSession(filePath, options = {}) {
    const fileStats = await fs.stat(filePath);
    const sessionId = this.generateSessionId(filePath, fileStats.mtime);
    
    const session = {
      id: sessionId,
      filePath: path.resolve(filePath),
      fileName: path.basename(filePath),
      fileSize: fileStats.size,
      fileModified: fileStats.mtime.toISOString(),
      options,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      status: 'created',
      progress: {
        totalChunks: 0,
        completedChunks: 0,
        percentage: 0,
        currentChunk: 0,
        processedFiles: [],
        errors: []
      },
      outputDir: null,
      finalOutputPath: null
    };

    await this.saveSession(session);
    return session;
  }

  generateSessionId(filePath, modifiedTime) {
    const hash = crypto.createHash('md5');
    hash.update(`${filePath}-${modifiedTime.getTime()}`);
    return hash.digest('hex').substring(0, 12);
  }

  async saveSession(session) {
    const sessions = await this.loadSessions();
    sessions[session.id] = { ...session, updatedAt: new Date().toISOString() };
    await this.saveSessions(sessions);
  }

  async loadSessions() {
    try {
      return await fs.readJson(this.sessionsFile);
    } catch (error) {
      return {};
    }
  }

  async saveSessions(sessions) {
    await fs.writeJson(this.sessionsFile, sessions, { spaces: 2 });
  }

  async updateProgress(sessionId, progressUpdate) {
    const sessions = await this.loadSessions();
    const session = sessions[sessionId];
    
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    // Update progress
    if (progressUpdate.totalChunks) {
      session.progress.totalChunks = progressUpdate.totalChunks;
    }
    
    if (progressUpdate.currentChunk !== undefined) {
      session.progress.currentChunk = progressUpdate.currentChunk;
      session.progress.completedChunks = progressUpdate.currentChunk;
      session.progress.percentage = Math.round((progressUpdate.currentChunk / session.progress.totalChunks) * 100);
    }

    if (progressUpdate.filePath) {
      session.progress.processedFiles.push({
        chunkNumber: progressUpdate.currentChunk,
        filePath: progressUpdate.filePath,
        completedAt: new Date().toISOString()
      });
    }

    if (progressUpdate.error) {
      session.progress.errors.push({
        chunkNumber: progressUpdate.currentChunk,
        error: progressUpdate.error,
        timestamp: new Date().toISOString()
      });
    }

    if (progressUpdate.status) {
      session.status = progressUpdate.status;
    }

    if (progressUpdate.outputDir) {
      session.outputDir = progressUpdate.outputDir;
    }

    if (progressUpdate.finalOutputPath) {
      session.finalOutputPath = progressUpdate.finalOutputPath;
    }

    session.updatedAt = new Date().toISOString();
    sessions[sessionId] = session;
    
    await this.saveSessions(sessions);
    return session;
  }

  async getSession(sessionId) {
    const sessions = await this.loadSessions();
    return sessions[sessionId] || null;
  }

  async getRecentSessions(limit = 10) {
    const sessions = await this.loadSessions();
    const sessionList = Object.values(sessions);
    
    return sessionList
      .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt))
      .slice(0, limit);
  }

  async findExistingSession(filePath) {
    try {
      const fileStats = await fs.stat(filePath);
      const sessionId = this.generateSessionId(filePath, fileStats.mtime);
      return await this.getSession(sessionId);
    } catch (error) {
      return null;
    }
  }

  async showResumeDialog() {
    const recentSessions = await this.getRecentSessions();
    const resumableSessions = recentSessions.filter(
      session => session.status !== 'completed' && session.progress.completedChunks > 0
    );

    if (resumableSessions.length === 0) {
      return null;
    }

    console.log(chalk.cyan('\n📋 Resume Previous Session'));
    console.log(chalk.gray('Found incomplete audiobook conversions\n'));

    const choices = resumableSessions.map(session => {
      const progress = `${session.progress.completedChunks}/${session.progress.totalChunks} chunks (${session.progress.percentage}%)`;
      const timeAgo = this.getTimeAgo(session.updatedAt);
      
      return {
        name: `${session.fileName} - ${progress} - ${timeAgo}`,
        value: session.id,
        short: session.fileName
      };
    });

    choices.push(new inquirer.Separator());
    choices.push({ name: '🆕 Start new conversion', value: 'new' });
    choices.push({ name: '🧹 Clear old sessions', value: 'clear' });

    const { choice } = await inquirer.prompt([
      {
        type: 'list',
        name: 'choice',
        message: 'Would you like to resume a previous session?',
        choices,
        pageSize: 10
      }
    ]);

    if (choice === 'new') {
      return null;
    } else if (choice === 'clear') {
      await this.clearOldSessions();
      return null;
    } else {
      const session = await this.getSession(choice);
      return await this.confirmResume(session);
    }
  }

  async confirmResume(session) {
    if (!session) return null;

    const progress = `${session.progress.completedChunks}/${session.progress.totalChunks}`;
    const timeAgo = this.getTimeAgo(session.updatedAt);
    
    console.log(chalk.cyan('\n📊 Session Details:'));
    console.log(chalk.white(`File: ${session.fileName}`));
    console.log(chalk.white(`Progress: ${progress} chunks (${session.progress.percentage}%)`));
    console.log(chalk.white(`Last updated: ${timeAgo}`));
    console.log(chalk.white(`Voice: ${session.options.voice || 'Not set'}`));
    console.log(chalk.white(`Model: ${session.options.model || 'Not set'}`));

    // Check if original file still exists
    const fileExists = await fs.pathExists(session.filePath);
    if (!fileExists) {
      console.log(chalk.red('\n❌ Original file no longer exists at:'));
      console.log(chalk.red(`   ${session.filePath}`));
      
      const { action } = await inquirer.prompt([
        {
          type: 'list',
          name: 'action',
          message: 'What would you like to do?',
          choices: [
            { name: '📁 Locate the file manually', value: 'locate' },
            { name: '🗑️  Delete this session', value: 'delete' },
            { name: '🔙 Back to menu', value: 'back' }
          ]
        }
      ]);

      if (action === 'locate') {
        return await this.relocateFile(session);
      } else if (action === 'delete') {
        await this.deleteSession(session.id);
        return null;
      } else {
        return null;
      }
    }

    const { resume } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'resume',
        message: 'Resume this session?',
        default: true
      }
    ]);

    return resume ? session : null;
  }

  async relocateFile(session) {
    const { filePath } = await inquirer.prompt([
      {
        type: 'input',
        name: 'filePath',
        message: 'Enter the new path to the file:',
        validate: async (input) => {
          if (!input) return 'Please provide a file path';
          if (!await fs.pathExists(input)) return 'File does not exist';
          
          // Check if it's the same file by comparing size and name
          const stats = await fs.stat(input);
          if (stats.size !== session.fileSize || path.basename(input) !== session.fileName) {
            return 'This appears to be a different file';
          }
          
          return true;
        }
      }
    ]);

    // Update session with new file path
    session.filePath = path.resolve(filePath);
    await this.saveSession(session);
    
    return session;
  }

  async deleteSession(sessionId) {
    const sessions = await this.loadSessions();
    delete sessions[sessionId];
    await this.saveSessions(sessions);
    
    // Also clean up any output files if they exist
    const sessionDir = path.join(this.progressDir, sessionId);
    if (await fs.pathExists(sessionDir)) {
      await fs.remove(sessionDir);
    }
  }

  async clearOldSessions() {
    const { confirm } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'confirm',
        message: 'Delete all session data? This cannot be undone.',
        default: false
      }
    ]);

    if (confirm) {
      await this.saveSessions({});
      await fs.emptyDir(this.progressDir);
      await fs.writeJson(this.sessionsFile, {});
      console.log(chalk.green('✅ All sessions cleared'));
    }
  }

  getTimeAgo(timestamp) {
    const now = new Date();
    const past = new Date(timestamp);
    const diffMs = now - past;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 1) return 'just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return past.toLocaleDateString();
  }

  async canResume(session) {
    // Check if session can be resumed
    if (!session || session.status === 'completed') {
      return { canResume: false, reason: 'Session is completed' };
    }

    if (session.progress.completedChunks === 0) {
      return { canResume: false, reason: 'No progress made yet' };
    }

    // Check if original file exists
    if (!await fs.pathExists(session.filePath)) {
      return { canResume: true, needsRelocation: true, reason: 'Original file needs to be located' };
    }

    // Check if output directory exists
    if (session.outputDir && await fs.pathExists(session.outputDir)) {
      const outputFiles = session.progress.processedFiles.map(f => f.filePath);
      const existingFiles = [];
      
      for (const file of outputFiles) {
        if (await fs.pathExists(file)) {
          existingFiles.push(file);
        }
      }

      return {
        canResume: true,
        needsRelocation: false,
        existingFiles: existingFiles.length,
        totalExpected: outputFiles.length
      };
    }

    return { canResume: true, needsRelocation: false };
  }

  async getSessionStats() {
    const sessions = await this.loadSessions();
    const sessionList = Object.values(sessions);
    
    const stats = {
      total: sessionList.length,
      completed: sessionList.filter(s => s.status === 'completed').length,
      inProgress: sessionList.filter(s => s.status === 'processing' || (s.progress.completedChunks > 0 && s.status !== 'completed')).length,
      failed: sessionList.filter(s => s.status === 'failed' || s.progress.errors.length > 0).length,
      totalProcessedChunks: sessionList.reduce((sum, s) => sum + s.progress.completedChunks, 0)
    };

    return stats;
  }
}

module.exports = ProgressManager;