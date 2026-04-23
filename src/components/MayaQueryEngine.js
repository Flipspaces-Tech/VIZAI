// MayaQueryEngine.js - Query validation and concatenation

import { MayaQueryFilter } from './MayaQueryFilter';

export class MayaQueryEngine {
  constructor() {
    this.filter = new MayaQueryFilter();
    this.SILENCE_TIMEOUT = 2000; // 2 seconds
    this.MIN_COMMAND_LENGTH = 2; // CHANGED: 4 → 2 (allow shorter queries like "green sofas")
    this.WAKE_WORDS = ["hi maya", "hey maya", "maaya","maya"];
    this.accumulatedQuery = "";
  }

  // Extract command by removing wake word
  extractCommand(transcript) {
    let command = transcript;

    for (const word of this.WAKE_WORDS) {
      const regex = new RegExp(`\\b${word}\\b\\s*`, "i");
      command = command.replace(regex, "").trim();
    }

    return command;
  }

  // Append to accumulated query (for mid-flow corrections)
  appendToQuery(newText) {
    this.accumulatedQuery += (this.accumulatedQuery ? " " : "") + newText;
  }

  // Get accumulated query
  getAccumulatedQuery() {
    return this.accumulatedQuery;
  }

  // Reset for next query
  resetQuery() {
    this.accumulatedQuery = "";
  }

  // Full validation pipeline
  validateQuery(transcript) {
    const command = this.extractCommand(transcript);

    // Validation 1: Minimum length
    const wordCount = command.split(" ").length;
    if (wordCount < this.MIN_COMMAND_LENGTH) {
      return {
        isValid: false,
        reason: `Command too short (${wordCount} words, need ${this.MIN_COMMAND_LENGTH})`
      };
    }

    // Validation 2-3: Use filter for blocked phrases & action verbs
    const filterResult = this.filter.validate(command);
    if (!filterResult.isValid) {
      return filterResult;
    }

    return {
      isValid: true,
      cleanCommand: command
    };
  }
}