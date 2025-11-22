/**
 * Budget Tracking System
 *
 * Tracks token usage and estimated costs against daily/monthly budgets
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';
import { HOME_DIR } from '../constants';

export interface Budget {
  daily?: {
    tokens?: number;        // Max tokens per day
    requests?: number;      // Max requests per day
    estimatedCost?: number; // Max estimated cost per day (USD)
  };
  monthly?: {
    tokens?: number;        // Max tokens per month
    requests?: number;      // Max requests per month
    estimatedCost?: number; // Max estimated cost per month (USD)
  };
  // Model-specific pricing (cost per 1M tokens)
  pricing?: {
    [modelKey: string]: {
      inputTokens: number;   // Cost per 1M input tokens
      outputTokens: number;  // Cost per 1M output tokens
    };
  };
}

export interface BudgetUsage {
  daily: {
    date: string;
    tokens: number;
    requests: number;
    estimatedCost: number;
    inputTokens: number;
    outputTokens: number;
  };
  monthly: {
    month: string; // YYYY-MM format
    tokens: number;
    requests: number;
    estimatedCost: number;
    inputTokens: number;
    outputTokens: number;
  };
  percentages: {
    daily: {
      tokens?: number;
      requests?: number;
      cost?: number;
    };
    monthly: {
      tokens?: number;
      requests?: number;
      cost?: number;
    };
  };
  isOverBudget: {
    daily: boolean;
    monthly: boolean;
  };
}

class BudgetTracker {
  private budgetFile: string;
  private usageFile: string;
  private budget: Budget = {};

  // Default pricing for common models (cost per 1M tokens in USD)
  private defaultPricing: Record<string, { inputTokens: number; outputTokens: number }> = {
    // Anthropic Claude models
    'claude-sonnet-4': { inputTokens: 3.0, outputTokens: 15.0 },
    'claude-opus-4': { inputTokens: 15.0, outputTokens: 75.0 },
    'claude-haiku-4': { inputTokens: 0.25, outputTokens: 1.25 },
    'claude-3-5-sonnet': { inputTokens: 3.0, outputTokens: 15.0 },
    'claude-3-opus': { inputTokens: 15.0, outputTokens: 75.0 },
    'claude-3-haiku': { inputTokens: 0.25, outputTokens: 1.25 },

    // OpenAI models
    'gpt-4': { inputTokens: 30.0, outputTokens: 60.0 },
    'gpt-4-turbo': { inputTokens: 10.0, outputTokens: 30.0 },
    'gpt-4o': { inputTokens: 2.5, outputTokens: 10.0 },
    'gpt-4o-mini': { inputTokens: 0.15, outputTokens: 0.6 },
    'gpt-3.5-turbo': { inputTokens: 0.5, outputTokens: 1.5 },

    // Default fallback
    'default': { inputTokens: 1.0, outputTokens: 2.0 },
  };

  constructor() {
    this.budgetFile = join(HOME_DIR, 'budget.json');
    this.usageFile = join(HOME_DIR, 'budget-usage.json');
    this.loadBudget();
  }

  private loadBudget() {
    try {
      if (existsSync(this.budgetFile)) {
        const data = readFileSync(this.budgetFile, 'utf8');
        this.budget = JSON.parse(data);
      }
    } catch (error) {
      console.error('Failed to load budget:', error);
    }
  }

  /**
   * Get current budget configuration
   */
  getBudget(): Budget {
    return this.budget;
  }

  /**
   * Update budget configuration
   */
  updateBudget(budget: Budget): void {
    this.budget = budget;
    try {
      writeFileSync(this.budgetFile, JSON.stringify(budget, null, 2), 'utf8');
    } catch (error) {
      console.error('Failed to save budget:', error);
      throw error;
    }
  }

  /**
   * Get pricing for a model
   */
  private getModelPricing(model: string): { inputTokens: number; outputTokens: number } {
    // Check custom pricing first
    if (this.budget.pricing && this.budget.pricing[model]) {
      return this.budget.pricing[model];
    }

    // Check default pricing
    for (const [key, pricing] of Object.entries(this.defaultPricing)) {
      if (model.toLowerCase().includes(key.toLowerCase())) {
        return pricing;
      }
    }

    // Fallback to default
    return this.defaultPricing['default'];
  }

  /**
   * Calculate estimated cost for a request
   */
  calculateCost(model: string, inputTokens: number, outputTokens: number): number {
    const pricing = this.getModelPricing(model);
    const inputCost = (inputTokens / 1_000_000) * pricing.inputTokens;
    const outputCost = (outputTokens / 1_000_000) * pricing.outputTokens;
    return inputCost + outputCost;
  }

  /**
   * Record usage for a request
   */
  recordUsage(model: string, inputTokens: number = 0, outputTokens: number = 0): void {
    try {
      const usage = this.loadUsage();
      const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
      const thisMonth = today.substring(0, 7); // YYYY-MM

      // Calculate cost
      const cost = this.calculateCost(model, inputTokens, outputTokens);
      const totalTokens = inputTokens + outputTokens;

      // Update daily usage
      if (!usage.daily || usage.daily.date !== today) {
        usage.daily = {
          date: today,
          tokens: 0,
          requests: 0,
          estimatedCost: 0,
          inputTokens: 0,
          outputTokens: 0,
        };
      }
      usage.daily.tokens += totalTokens;
      usage.daily.requests += 1;
      usage.daily.estimatedCost += cost;
      usage.daily.inputTokens += inputTokens;
      usage.daily.outputTokens += outputTokens;

      // Update monthly usage
      if (!usage.monthly || usage.monthly.month !== thisMonth) {
        usage.monthly = {
          month: thisMonth,
          tokens: 0,
          requests: 0,
          estimatedCost: 0,
          inputTokens: 0,
          outputTokens: 0,
        };
      }
      usage.monthly.tokens += totalTokens;
      usage.monthly.requests += 1;
      usage.monthly.estimatedCost += cost;
      usage.monthly.inputTokens += inputTokens;
      usage.monthly.outputTokens += outputTokens;

      this.saveUsage(usage);
    } catch (error) {
      console.error('Failed to record usage:', error);
    }
  }

  /**
   * Get current usage with budget comparison
   */
  getUsage(): BudgetUsage {
    const usage = this.loadUsage();
    const today = new Date().toISOString().split('T')[0];
    const thisMonth = today.substring(0, 7);

    // Reset if date changed
    if (!usage.daily || usage.daily.date !== today) {
      usage.daily = {
        date: today,
        tokens: 0,
        requests: 0,
        estimatedCost: 0,
        inputTokens: 0,
        outputTokens: 0,
      };
    }

    if (!usage.monthly || usage.monthly.month !== thisMonth) {
      usage.monthly = {
        month: thisMonth,
        tokens: 0,
        requests: 0,
        estimatedCost: 0,
        inputTokens: 0,
        outputTokens: 0,
      };
    }

    // Calculate percentages
    const percentages: BudgetUsage['percentages'] = {
      daily: {},
      monthly: {},
    };

    // Daily percentages
    if (this.budget.daily) {
      if (this.budget.daily.tokens) {
        percentages.daily.tokens = (usage.daily.tokens / this.budget.daily.tokens) * 100;
      }
      if (this.budget.daily.requests) {
        percentages.daily.requests = (usage.daily.requests / this.budget.daily.requests) * 100;
      }
      if (this.budget.daily.estimatedCost) {
        percentages.daily.cost = (usage.daily.estimatedCost / this.budget.daily.estimatedCost) * 100;
      }
    }

    // Monthly percentages
    if (this.budget.monthly) {
      if (this.budget.monthly.tokens) {
        percentages.monthly.tokens = (usage.monthly.tokens / this.budget.monthly.tokens) * 100;
      }
      if (this.budget.monthly.requests) {
        percentages.monthly.requests = (usage.monthly.requests / this.budget.monthly.requests) * 100;
      }
      if (this.budget.monthly.estimatedCost) {
        percentages.monthly.cost = (usage.monthly.estimatedCost / this.budget.monthly.estimatedCost) * 100;
      }
    }

    // Check if over budget
    const isOverBudget = {
      daily: this.isOverDailyBudget(usage.daily),
      monthly: this.isOverMonthlyBudget(usage.monthly),
    };

    return {
      daily: usage.daily,
      monthly: usage.monthly,
      percentages,
      isOverBudget,
    };
  }

  /**
   * Check if over daily budget
   */
  private isOverDailyBudget(daily: BudgetUsage['daily']): boolean {
    if (!this.budget.daily) return false;

    const checks = [
      this.budget.daily.tokens && daily.tokens > this.budget.daily.tokens,
      this.budget.daily.requests && daily.requests > this.budget.daily.requests,
      this.budget.daily.estimatedCost && daily.estimatedCost > this.budget.daily.estimatedCost,
    ];

    return checks.some(check => check === true);
  }

  /**
   * Check if over monthly budget
   */
  private isOverMonthlyBudget(monthly: BudgetUsage['monthly']): boolean {
    if (!this.budget.monthly) return false;

    const checks = [
      this.budget.monthly.tokens && monthly.tokens > this.budget.monthly.tokens,
      this.budget.monthly.requests && monthly.requests > this.budget.monthly.requests,
      this.budget.monthly.estimatedCost && monthly.estimatedCost > this.budget.monthly.estimatedCost,
    ];

    return checks.some(check => check === true);
  }

  /**
   * Load usage data
   */
  private loadUsage(): { daily: any; monthly: any } {
    try {
      if (existsSync(this.usageFile)) {
        const data = readFileSync(this.usageFile, 'utf8');
        return JSON.parse(data);
      }
    } catch (error) {
      console.error('Failed to load usage:', error);
    }

    return {
      daily: {
        date: new Date().toISOString().split('T')[0],
        tokens: 0,
        requests: 0,
        estimatedCost: 0,
        inputTokens: 0,
        outputTokens: 0,
      },
      monthly: {
        month: new Date().toISOString().substring(0, 7),
        tokens: 0,
        requests: 0,
        estimatedCost: 0,
        inputTokens: 0,
        outputTokens: 0,
      },
    };
  }

  /**
   * Save usage data
   */
  private saveUsage(usage: any): void {
    try {
      writeFileSync(this.usageFile, JSON.stringify(usage, null, 2), 'utf8');
    } catch (error) {
      console.error('Failed to save usage:', error);
    }
  }

  /**
   * Get usage history (for charts/graphs)
   */
  getUsageHistory(days: number = 30): Array<{
    date: string;
    tokens: number;
    requests: number;
    estimatedCost: number;
  }> {
    // This would be enhanced to read from a historical log file
    // For now, return current day's data
    const usage = this.loadUsage();
    return [usage.daily];
  }
}

// Export singleton instance
export const budgetTracker = new BudgetTracker();
