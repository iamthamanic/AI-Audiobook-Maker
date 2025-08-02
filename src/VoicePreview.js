const inquirer = require('inquirer');
const chalk = require('chalk');
const { exec } = require('child_process');
const { promisify } = require('util');
const os = require('os');
const path = require('path');
const fs = require('fs-extra');

const execAsync = promisify(exec);

class VoicePreview {
  constructor(ttsService) {
    this.ttsService = ttsService;
    this.platform = os.platform();
  }

  async showVoiceSelection(provider = 'openai') {
    console.log(chalk.cyan(`\n🎤 Voice Selection & Preview (${provider.toUpperCase()})`));
    console.log(chalk.gray('Listen to each voice before making your choice\n'));

    const voices = this.ttsService.getVoices();
    const { action } = await inquirer.prompt([
      {
        type: 'list',
        name: 'action',
        message: 'What would you like to do?',
        choices: [
          { name: '🎧 Preview all voices', value: 'preview_all' },
          { name: '🎯 Select voice directly', value: 'select_direct' },
          { name: '🔙 Back to main menu', value: 'back' },
        ],
      },
    ]);

    switch (action) {
      case 'preview_all':
        return await this.previewAllVoices(provider);
      case 'select_direct':
        return await this.selectVoiceDirect(provider);
      case 'back':
        return null;
    }
  }

  async previewAllVoices(provider = 'openai') {
    console.log(chalk.cyan('\n🎵 Generating previews for all voices...'));

    try {
      const { previews, errors } = await this.ttsService.generateAllPreviews();

      if (Object.keys(previews).length === 0) {
        console.log(chalk.red('❌ Failed to generate any previews'));
        return null;
      }

      return await this.playPreviewsAndSelect(previews, errors);
    } catch (error) {
      console.log(chalk.red(`❌ Error generating previews: ${error.message}`));
      return null;
    }
  }

  async playPreviewsAndSelect(previews, errors = []) {
    const availableVoices = Object.keys(previews);

    if (availableVoices.length === 0) {
      console.log(chalk.red('❌ No voice previews available'));
      return null;
    }

    console.log(chalk.green('\n✅ Voice previews ready!'));
    console.log(chalk.gray('Preview text: "' + this.ttsService.previewText + '"\n'));

    let selectedVoice = null;

    while (!selectedVoice) {
      const choices = availableVoices.map((voice) => {
        const displayName =
          typeof voice === 'string'
            ? `${voice.charAt(0).toUpperCase() + voice.slice(1)}`
            : voice.name || voice;
        return {
          name: `🎵 ${displayName}`,
          value: voice,
        };
      });

      // Add error voices as disabled options
      if (errors.length > 0) {
        choices.push(new inquirer.Separator(chalk.red('── Failed to generate ──')));
        errors.forEach(({ voice, error }) => {
          choices.push({
            name: chalk.red(`❌ ${voice} (${error})`),
            disabled: true,
          });
        });
      }

      choices.push(new inquirer.Separator('── Actions ──'));
      choices.push({ name: '✅ Select this voice and continue', value: 'select' });
      choices.push({ name: '🔄 Regenerate failed previews', value: 'retry' });
      choices.push({ name: '🔙 Back to main menu', value: 'back' });

      const { choice } = await inquirer.prompt([
        {
          type: 'list',
          name: 'choice',
          message: 'Choose a voice to preview or take action:',
          choices,
          pageSize: 15,
        },
      ]);

      if (choice === 'back') {
        return null;
      } else if (choice === 'select') {
        return await this.selectFromPreviewed(availableVoices);
      } else if (choice === 'retry') {
        return await this.retryFailedPreviews(errors);
      } else if (availableVoices.includes(choice)) {
        await this.playPreview(previews[choice], choice);
      }
    }
  }

  async selectFromPreviewed(availableVoices) {
    const choices = availableVoices.map((voice) => {
      const displayName =
        typeof voice === 'string'
          ? `${voice.charAt(0).toUpperCase() + voice.slice(1)}`
          : voice.name || voice;
      return {
        name: displayName,
        value: voice,
      };
    });

    const { voice } = await inquirer.prompt([
      {
        type: 'list',
        name: 'voice',
        message: 'Select your preferred voice:',
        choices: choices,
      },
    ]);

    return voice;
  }

  async retryFailedPreviews(errors) {
    console.log(chalk.yellow('\n🔄 Retrying failed previews...'));

    const retryResults = { previews: {}, errors: [] };

    for (const { voice } of errors) {
      try {
        const previewFile = await this.ttsService.generateVoicePreview(voice);
        retryResults.previews[voice] = previewFile;
      } catch (error) {
        retryResults.errors.push({ voice, error: error.message });
      }
    }

    return await this.playPreviewsAndSelect(retryResults.previews, retryResults.errors);
  }

  async selectVoiceDirect(provider = 'openai') {
    const voices = this.ttsService.getVoices();

    // Handle both string voices (OpenAI) and object voices (Kyutai)
    const choices = voices.map((voice) => {
      if (typeof voice === 'string') {
        // OpenAI voices are strings
        return {
          name: `${voice.charAt(0).toUpperCase() + voice.slice(1)}`,
          value: voice,
        };
      } else {
        // Kyutai voices are objects with name and value
        return {
          name: voice.name,
          value: voice.value,
        };
      }
    });

    const { voice } = await inquirer.prompt([
      {
        type: 'list',
        name: 'voice',
        message: 'Select a voice:',
        choices: choices,
      },
    ]);

    const { wantPreview } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'wantPreview',
        message: `Would you like to preview the ${voice} voice before continuing?`,
        default: true,
      },
    ]);

    if (wantPreview) {
      try {
        const previewFile = await this.ttsService.generateVoicePreview(voice);
        await this.playPreview(previewFile, voice);

        const { confirmed } = await inquirer.prompt([
          {
            type: 'confirm',
            name: 'confirmed',
            message: `Use ${voice} voice for your audiobook?`,
            default: true,
          },
        ]);

        if (!confirmed) {
          return await this.selectVoiceDirect();
        }
      } catch (error) {
        console.log(chalk.red(`❌ Failed to generate preview: ${error.message}`));

        const { proceed } = await inquirer.prompt([
          {
            type: 'confirm',
            name: 'proceed',
            message: `Continue with ${voice} voice anyway?`,
            default: false,
          },
        ]);

        if (!proceed) {
          return await this.selectVoiceDirect();
        }
      }
    }

    return voice;
  }

  async playPreview(filePath, voiceName) {
    if (!(await fs.pathExists(filePath))) {
      console.log(chalk.red(`❌ Preview file not found: ${filePath}`));
      return;
    }

    console.log(chalk.cyan(`\n🎵 Playing preview for ${voiceName}...`));
    console.log(chalk.gray('Press Ctrl+C to stop playback\n'));

    try {
      await this.playAudioFile(filePath);
      console.log(chalk.green(`✅ Preview completed for ${voiceName}`));
    } catch (error) {
      console.log(chalk.red(`❌ Failed to play preview: ${error.message}`));
      console.log(chalk.yellow(`💡 You can manually play: ${filePath}`));
    }
  }

  async playAudioFile(filePath) {
    let command;

    switch (this.platform) {
      case 'darwin': // macOS
        command = `afplay "${filePath}"`;
        break;
      case 'win32': // Windows
        command = `powershell -c "Add-Type -AssemblyName presentationCore; $mediaPlayer = New-Object system.windows.media.mediaplayer; $mediaPlayer.open('${filePath}'); $mediaPlayer.Play(); Start-Sleep -s 12; $mediaPlayer.Stop()"`;
        break;
      case 'linux': // Linux
        // Try different audio players
        const players = ['ffplay', 'mpv', 'vlc', 'mplayer'];
        let playerFound = false;

        for (const player of players) {
          try {
            await execAsync(`which ${player}`);
            command =
              player === 'ffplay'
                ? `ffplay -nodisp -autoexit "${filePath}"`
                : `${player} "${filePath}"`;
            playerFound = true;
            break;
          } catch (error) {
            // Player not found, try next
          }
        }

        if (!playerFound) {
          throw new Error('No audio player found. Please install ffplay, mpv, vlc, or mplayer');
        }
        break;
      default:
        throw new Error(`Unsupported platform: ${this.platform}`);
    }

    try {
      await execAsync(command, { timeout: 15000 }); // 15 second timeout
    } catch (error) {
      if (error.signal === 'SIGTERM') {
        // Normal timeout, preview completed
        return;
      }
      throw error;
    }
  }

  async getAdvancedSettings(provider = 'openai') {
    console.log(chalk.cyan(`\n⚙️  Advanced Settings (${provider.toUpperCase()})`));

    const promptFields = [
      {
        type: 'input',
        name: 'speed',
        message: 'Speech speed (0.25 - 4.0):',
        default: '1.0',
        validate: (input) => {
          const speed = parseFloat(input);
          if (isNaN(speed) || speed < 0.25 || speed > 4.0) {
            return 'Speed must be a number between 0.25 and 4.0';
          }
          return true;
        },
      },
    ];

    // Add provider-specific settings
    if (provider === 'openai') {
      promptFields.push({
        type: 'list',
        name: 'model',
        message: 'TTS Model:',
        choices: [
          { name: 'tts-1 (Faster, Standard Quality)', value: 'tts-1' },
          { name: 'tts-1-hd (Slower, Higher Quality)', value: 'tts-1-hd' },
        ],
        default: 'tts-1',
      });
    } else if (provider === 'kyutai') {
      promptFields.push({
        type: 'list',
        name: 'model',
        message: 'Quality Setting:',
        choices: [
          { name: 'Standard (Faster)', value: 'standard' },
          { name: 'High Quality (Slower)', value: 'high' },
        ],
        default: 'standard',
      });
    }

    promptFields.push({
      type: 'list',
      name: 'outputOptions',
      message: 'Output format:',
      choices: [
        { name: 'Single MP3 file (recommended)', value: 'single' },
        { name: 'Separate files per chunk', value: 'separate' },
        { name: 'Both single and separate files', value: 'both' },
      ],
      default: 'single',
    });

    promptFields.push({
      type: 'list',
      name: 'outputDirectory',
      message: 'Output location:',
      choices: [
        { name: '📁 Desktop', value: path.join(os.homedir(), 'Desktop') },
        { name: '🏠 Home folder', value: os.homedir() },
        { name: '📂 Documents', value: path.join(os.homedir(), 'Documents') },
        { name: '🎵 Music folder', value: path.join(os.homedir(), 'Music') },
        { name: '📋 Current directory', value: process.cwd() },
        { name: '✏️  Custom path...', value: 'custom' },
      ],
      default: path.join(os.homedir(), 'Desktop'),
    });

    const { speed, model, outputOptions, outputDirectory } = await inquirer.prompt(promptFields);

    // Handle custom path input
    let finalOutputDirectory = outputDirectory;
    if (outputDirectory === 'custom') {
      const { customPath } = await inquirer.prompt([
        {
          type: 'input',
          name: 'customPath',
          message: 'Enter custom output path:',
          default: os.homedir(),
          validate: async (input) => {
            try {
              const expandedPath = input.startsWith('~')
                ? path.join(os.homedir(), input.slice(1))
                : path.resolve(input);

              await fs.ensureDir(expandedPath);
              return true;
            } catch (error) {
              return `Invalid path or unable to create directory: ${error.message}`;
            }
          },
        },
      ]);

      finalOutputDirectory = customPath.startsWith('~')
        ? path.join(os.homedir(), customPath.slice(1))
        : path.resolve(customPath);
    }

    return {
      speed: parseFloat(speed),
      model,
      outputOptions,
      outputDirectory: finalOutputDirectory,
    };
  }
}

module.exports = VoicePreview;
