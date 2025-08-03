const { getPreviewText, detectVoiceLanguage, getPreviewCacheFilename, PREVIEW_TEXTS } = require('../src/PreviewTexts');

describe('PreviewTexts', () => {
  describe('PREVIEW_TEXTS constant', () => {
    test('should contain all required language texts', () => {
      expect(PREVIEW_TEXTS).toBeDefined();
      expect(PREVIEW_TEXTS.german).toBeDefined();
      expect(PREVIEW_TEXTS.english).toBeDefined();
      expect(PREVIEW_TEXTS.french).toBeDefined();
      expect(PREVIEW_TEXTS.default).toBeDefined();
    });

    test('should have short and long texts for each language', () => {
      const languages = ['german', 'english', 'french', 'default'];
      
      languages.forEach(lang => {
        expect(PREVIEW_TEXTS[lang]).toHaveProperty('short');
        expect(PREVIEW_TEXTS[lang]).toHaveProperty('long');
        expect(typeof PREVIEW_TEXTS[lang].short).toBe('string');
        expect(typeof PREVIEW_TEXTS[lang].long).toBe('string');
        expect(PREVIEW_TEXTS[lang].short.length).toBeGreaterThan(0);
        expect(PREVIEW_TEXTS[lang].long.length).toBeGreaterThan(0);
      });
    });
  });

  describe('getPreviewText', () => {
    test('should return German text for "de" language code', () => {
      const text = getPreviewText('de', 'short');
      expect(text).toBe(PREVIEW_TEXTS.german.short);
    });

    test('should return English text for "en" language code', () => {
      const text = getPreviewText('en', 'short');
      expect(text).toBe(PREVIEW_TEXTS.english.short);
    });

    test('should return French text for "fr" language code', () => {
      const text = getPreviewText('fr', 'short');
      expect(text).toBe(PREVIEW_TEXTS.french.short);
    });

    test('should return long text when specified', () => {
      const text = getPreviewText('de', 'long');
      expect(text).toBe(PREVIEW_TEXTS.german.long);
    });

    test('should default to short text when length not specified', () => {
      const text = getPreviewText('en');
      expect(text).toBe(PREVIEW_TEXTS.english.short);
    });

    test('should handle language name strings', () => {
      expect(getPreviewText('german')).toBe(PREVIEW_TEXTS.german.short);
      expect(getPreviewText('english')).toBe(PREVIEW_TEXTS.english.short);
      expect(getPreviewText('french')).toBe(PREVIEW_TEXTS.french.short);
    });

    test('should fallback to default for unknown languages', () => {
      const text = getPreviewText('unknown');
      expect(text).toBe(PREVIEW_TEXTS.default.short);
    });

    test('should handle undefined/null language', () => {
      expect(getPreviewText()).toBe(PREVIEW_TEXTS.english.short);
      expect(getPreviewText(null)).toBe(PREVIEW_TEXTS.default.short);
    });

    test('should fallback to short text for unknown length', () => {
      const text = getPreviewText('en', 'unknown');
      expect(text).toBe(PREVIEW_TEXTS.english.short);
    });
  });

  describe('detectVoiceLanguage', () => {
    test('should detect German from voice strings', () => {
      expect(detectVoiceLanguage('de-female-1')).toBe('de');
      expect(detectVoiceLanguage('german-voice')).toBe('de');
      expect(detectVoiceLanguage('deutsch-voice')).toBe('de');
      expect(detectVoiceLanguage('thorsten-male')).toBe('de');
    });

    test('should detect French from voice strings', () => {
      expect(detectVoiceLanguage('fr-female-1')).toBe('fr');
      expect(detectVoiceLanguage('french-voice')).toBe('fr');
      expect(detectVoiceLanguage('français-voice')).toBe('fr');
    });

    test('should default to English for unrecognized voices', () => {
      expect(detectVoiceLanguage('alloy')).toBe('en');
      expect(detectVoiceLanguage('nova')).toBe('en');
      expect(detectVoiceLanguage('en-female-1')).toBe('en');
      expect(detectVoiceLanguage('unknown-voice')).toBe('en');
    });

    test('should handle voice objects with value property', () => {
      const voiceObj = { value: 'de-female-1', name: 'German Female' };
      expect(detectVoiceLanguage(voiceObj)).toBe('de');
    });

    test('should handle voice objects with name property', () => {
      const voiceObj = { name: 'thorsten-emotional' };
      expect(detectVoiceLanguage(voiceObj)).toBe('de');
    });

    test('should handle empty/undefined voice', () => {
      expect(detectVoiceLanguage('')).toBe('en');
      expect(detectVoiceLanguage(null)).toBe('en');
      expect(detectVoiceLanguage(undefined)).toBe('en');
      expect(detectVoiceLanguage({})).toBe('en');
    });

    test('should be case insensitive', () => {
      expect(detectVoiceLanguage('DE-FEMALE-1')).toBe('de');
      expect(detectVoiceLanguage('GERMAN-VOICE')).toBe('de');
      expect(detectVoiceLanguage('FR-MALE-1')).toBe('fr');
    });
  });

  describe('getPreviewCacheFilename', () => {
    test('should generate consistent cache filenames', () => {
      const filename = getPreviewCacheFilename('openai', 'alloy', 'en');
      expect(filename).toBe('preview_openai_alloy_en.wav');
    });

    test('should sanitize voice names with special characters', () => {
      const filename = getPreviewCacheFilename('fishspeech', 'de-female-1', 'de');
      expect(filename).toBe('preview_fishspeech_de_female_1_de.wav');
    });

    test('should handle complex voice names', () => {
      const filename = getPreviewCacheFilename('thorsten', 'thorsten-emotional', 'de');
      expect(filename).toBe('preview_thorsten_thorsten_emotional_de.wav');
    });

    test('should remove non-alphanumeric characters except hyphens', () => {
      const filename = getPreviewCacheFilename('test', 'voice@with#special$chars', 'en');
      expect(filename).toBe('preview_test_voice_with_special_chars_en.wav');
    });

    test('should always end with .wav extension', () => {
      const filename = getPreviewCacheFilename('provider', 'voice', 'lang');
      expect(filename).toMatch(/\.wav$/);
    });

    test('should handle different providers', () => {
      expect(getPreviewCacheFilename('openai', 'nova', 'en')).toContain('openai');
      expect(getPreviewCacheFilename('fishspeech', 'voice', 'de')).toContain('fishspeech');
      expect(getPreviewCacheFilename('thorsten', 'voice', 'de')).toContain('thorsten');
    });
  });

  describe('Integration tests', () => {
    test('should work together for complete preview workflow', () => {
      // Simulate a German voice detection and preview generation
      const voice = 'de-female-1';
      const language = detectVoiceLanguage(voice);
      const previewText = getPreviewText(language, 'short');
      const cacheFilename = getPreviewCacheFilename('fishspeech', voice, language);

      expect(language).toBe('de');
      expect(previewText).toBe(PREVIEW_TEXTS.german.short);
      expect(cacheFilename).toBe('preview_fishspeech_de_female_1_de.wav');
    });

    test('should work for English OpenAI voice', () => {
      const voice = 'alloy';
      const language = detectVoiceLanguage(voice);
      const previewText = getPreviewText(language, 'long');
      const cacheFilename = getPreviewCacheFilename('openai', voice, language);

      expect(language).toBe('en');
      expect(previewText).toBe(PREVIEW_TEXTS.english.long);
      expect(cacheFilename).toBe('preview_openai_alloy_en.wav');
    });

    test('should work for Thorsten German voice', () => {
      const voice = 'thorsten-male';
      const language = detectVoiceLanguage(voice);
      const previewText = getPreviewText(language, 'short');
      const cacheFilename = getPreviewCacheFilename('thorsten', voice, language);

      expect(language).toBe('de');
      expect(previewText).toBe(PREVIEW_TEXTS.german.short);
      expect(cacheFilename).toBe('preview_thorsten_thorsten_male_de.wav');
    });
  });
});