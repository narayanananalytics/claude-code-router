import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { api } from '@/lib/api';
import {
  X,
  RefreshCw,
  Save,
  DollarSign,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  CheckCircle,
  Calendar,
  CalendarDays,
  Coins,
  Activity,
} from 'lucide-react';

interface Budget {
  daily?: {
    tokens?: number;
    requests?: number;
    estimatedCost?: number;
  };
  monthly?: {
    tokens?: number;
    requests?: number;
    estimatedCost?: number;
  };
}

interface BudgetUsage {
  daily: {
    date: string;
    tokens: number;
    requests: number;
    estimatedCost: number;
    inputTokens: number;
    outputTokens: number;
  };
  monthly: {
    month: string;
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

interface BudgetManagerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  showToast?: (message: string, type: 'success' | 'error' | 'warning') => void;
}

export function BudgetManager({ open, onOpenChange, showToast }: BudgetManagerProps) {
  const [budget, setBudget] = useState<Budget>({});
  const [usage, setUsage] = useState<BudgetUsage | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [editMode, setEditMode] = useState(false);

  useEffect(() => {
    if (open) {
      loadBudget();
      loadUsage();

      // Auto-refresh usage every 10 seconds
      const interval = setInterval(loadUsage, 10000);
      return () => clearInterval(interval);
    }
  }, [open]);

  const loadBudget = async () => {
    try {
      setIsLoading(true);
      const data = await api.getBudget();
      setBudget(data || {});
    } catch (error) {
      console.error('Failed to load budget:', error);
      if (showToast) {
        showToast('Failed to load budget: ' + (error as Error).message, 'error');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const loadUsage = async () => {
    try {
      const data = await api.getBudgetUsage();
      setUsage(data);
    } catch (error) {
      console.error('Failed to load usage:', error);
    }
  };

  const saveBudget = async () => {
    try {
      setIsSaving(true);
      await api.updateBudget(budget);
      setEditMode(false);
      if (showToast) {
        showToast('Budget updated successfully', 'success');
      }
      loadUsage(); // Reload usage to recalculate percentages
    } catch (error) {
      console.error('Failed to save budget:', error);
      if (showToast) {
        showToast('Failed to save budget: ' + (error as Error).message, 'error');
      }
    } finally {
      setIsSaving(false);
    }
  };

  const formatNumber = (num: number | undefined) => {
    if (num === undefined) return 'N/A';
    return num.toLocaleString();
  };

  const formatCost = (cost: number | undefined) => {
    if (cost === undefined) return 'N/A';
    return `$${cost.toFixed(4)}`;
  };

  const getProgressColor = (percentage: number | undefined) => {
    if (!percentage) return 'bg-gray-200';
    if (percentage >= 100) return 'bg-red-500';
    if (percentage >= 80) return 'bg-yellow-500';
    return 'bg-green-500';
  };

  const getProgressBarWidth = (percentage: number | undefined) => {
    if (!percentage) return '0%';
    return `${Math.min(percentage, 100)}%`;
  };

  const renderProgressBar = (
    label: string,
    current: number,
    limit: number | undefined,
    percentage: number | undefined,
    formatFn: (n: number) => string
  ) => {
    if (!limit) return null;

    return (
      <div className="mb-4">
        <div className="flex justify-between mb-1 text-sm">
          <span className="font-medium">{label}</span>
          <span className="text-gray-600">
            {formatFn(current)} / {formatFn(limit)}
            {percentage !== undefined && ` (${percentage.toFixed(1)}%)`}
          </span>
        </div>
        <div className="w-full h-3 bg-gray-200 rounded-full overflow-hidden">
          <div
            className={`h-full ${getProgressColor(percentage)} transition-all duration-300`}
            style={{ width: getProgressBarWidth(percentage) }}
          />
        </div>
        {percentage !== undefined && percentage >= 90 && (
          <p className="text-xs text-red-600 mt-1 flex items-center gap-1">
            <AlertTriangle className="h-3 w-3" />
            {percentage >= 100 ? 'Budget exceeded!' : 'Approaching budget limit'}
          </p>
        )}
      </div>
    );
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between border-b p-4 bg-gradient-to-r from-green-50 to-emerald-50">
          <div className="flex items-center gap-3">
            <DollarSign className="h-6 w-6 text-green-600" />
            <div>
              <h2 className="text-xl font-bold text-gray-900">Budget Management</h2>
              <p className="text-sm text-gray-600">Track and control LLM usage costs</p>
            </div>
          </div>
          <div className="flex gap-2">
            {!editMode ? (
              <>
                <Button variant="outline" size="sm" onClick={() => setEditMode(true)}>
                  Edit Budget
                </Button>
                <Button variant="outline" size="sm" onClick={loadUsage}>
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Refresh
                </Button>
              </>
            ) : (
              <>
                <Button variant="outline" size="sm" onClick={() => {
                  setEditMode(false);
                  loadBudget(); // Reset to original
                }}>
                  Cancel
                </Button>
                <Button size="sm" onClick={saveBudget} disabled={isSaving}>
                  <Save className="h-4 w-4 mr-2" />
                  {isSaving ? 'Saving...' : 'Save'}
                </Button>
              </>
            )}
            <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {isLoading ? (
            <div className="flex items-center justify-center h-32">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-600"></div>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-6">
              {/* Daily Budget */}
              <Card className="p-6">
                <div className="flex items-center gap-2 mb-4">
                  <Calendar className="h-5 w-5 text-blue-600" />
                  <h3 className="text-lg font-semibold">Daily Budget</h3>
                  {usage?.isOverBudget.daily && (
                    <Badge className="bg-red-100 text-red-800">
                      <AlertTriangle className="h-3 w-3 mr-1" />
                      Over Budget
                    </Badge>
                  )}
                </div>

                {editMode ? (
                  <div className="space-y-4">
                    <div>
                      <label className="text-sm font-medium mb-1 block">Max Tokens</label>
                      <Input
                        type="number"
                        placeholder="e.g., 1000000"
                        value={budget.daily?.tokens || ''}
                        onChange={(e) => setBudget({
                          ...budget,
                          daily: { ...budget.daily, tokens: parseInt(e.target.value) || undefined }
                        })}
                      />
                    </div>
                    <div>
                      <label className="text-sm font-medium mb-1 block">Max Requests</label>
                      <Input
                        type="number"
                        placeholder="e.g., 1000"
                        value={budget.daily?.requests || ''}
                        onChange={(e) => setBudget({
                          ...budget,
                          daily: { ...budget.daily, requests: parseInt(e.target.value) || undefined }
                        })}
                      />
                    </div>
                    <div>
                      <label className="text-sm font-medium mb-1 block">Max Cost (USD)</label>
                      <Input
                        type="number"
                        step="0.01"
                        placeholder="e.g., 10.00"
                        value={budget.daily?.estimatedCost || ''}
                        onChange={(e) => setBudget({
                          ...budget,
                          daily: { ...budget.daily, estimatedCost: parseFloat(e.target.value) || undefined }
                        })}
                      />
                    </div>
                  </div>
                ) : usage ? (
                  <div>
                    <div className="grid grid-cols-2 gap-4 mb-4 text-sm">
                      <div className="bg-blue-50 p-3 rounded">
                        <p className="text-gray-600">Date</p>
                        <p className="font-semibold text-blue-900">{usage.daily.date}</p>
                      </div>
                      <div className="bg-green-50 p-3 rounded">
                        <p className="text-gray-600">Total Cost</p>
                        <p className="font-semibold text-green-900">
                          {formatCost(usage.daily.estimatedCost)}
                        </p>
                      </div>
                    </div>

                    {renderProgressBar(
                      'Tokens',
                      usage.daily.tokens,
                      budget.daily?.tokens,
                      usage.percentages.daily.tokens,
                      (n) => n.toLocaleString()
                    )}

                    {renderProgressBar(
                      'Requests',
                      usage.daily.requests,
                      budget.daily?.requests,
                      usage.percentages.daily.requests,
                      (n) => n.toString()
                    )}

                    {renderProgressBar(
                      'Cost',
                      usage.daily.estimatedCost,
                      budget.daily?.estimatedCost,
                      usage.percentages.daily.cost,
                      formatCost
                    )}

                    <div className="mt-4 pt-4 border-t space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span className="text-gray-600">Input Tokens</span>
                        <span className="font-medium">{formatNumber(usage.daily.inputTokens)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600">Output Tokens</span>
                        <span className="font-medium">{formatNumber(usage.daily.outputTokens)}</span>
                      </div>
                    </div>
                  </div>
                ) : (
                  <p className="text-gray-500 text-sm">No usage data available</p>
                )}
              </Card>

              {/* Monthly Budget */}
              <Card className="p-6">
                <div className="flex items-center gap-2 mb-4">
                  <CalendarDays className="h-5 w-5 text-purple-600" />
                  <h3 className="text-lg font-semibold">Monthly Budget</h3>
                  {usage?.isOverBudget.monthly && (
                    <Badge className="bg-red-100 text-red-800">
                      <AlertTriangle className="h-3 w-3 mr-1" />
                      Over Budget
                    </Badge>
                  )}
                </div>

                {editMode ? (
                  <div className="space-y-4">
                    <div>
                      <label className="text-sm font-medium mb-1 block">Max Tokens</label>
                      <Input
                        type="number"
                        placeholder="e.g., 30000000"
                        value={budget.monthly?.tokens || ''}
                        onChange={(e) => setBudget({
                          ...budget,
                          monthly: { ...budget.monthly, tokens: parseInt(e.target.value) || undefined }
                        })}
                      />
                    </div>
                    <div>
                      <label className="text-sm font-medium mb-1 block">Max Requests</label>
                      <Input
                        type="number"
                        placeholder="e.g., 30000"
                        value={budget.monthly?.requests || ''}
                        onChange={(e) => setBudget({
                          ...budget,
                          monthly: { ...budget.monthly, requests: parseInt(e.target.value) || undefined }
                        })}
                      />
                    </div>
                    <div>
                      <label className="text-sm font-medium mb-1 block">Max Cost (USD)</label>
                      <Input
                        type="number"
                        step="0.01"
                        placeholder="e.g., 300.00"
                        value={budget.monthly?.estimatedCost || ''}
                        onChange={(e) => setBudget({
                          ...budget,
                          monthly: { ...budget.monthly, estimatedCost: parseFloat(e.target.value) || undefined }
                        })}
                      />
                    </div>
                  </div>
                ) : usage ? (
                  <div>
                    <div className="grid grid-cols-2 gap-4 mb-4 text-sm">
                      <div className="bg-purple-50 p-3 rounded">
                        <p className="text-gray-600">Month</p>
                        <p className="font-semibold text-purple-900">{usage.monthly.month}</p>
                      </div>
                      <div className="bg-green-50 p-3 rounded">
                        <p className="text-gray-600">Total Cost</p>
                        <p className="font-semibold text-green-900">
                          {formatCost(usage.monthly.estimatedCost)}
                        </p>
                      </div>
                    </div>

                    {renderProgressBar(
                      'Tokens',
                      usage.monthly.tokens,
                      budget.monthly?.tokens,
                      usage.percentages.monthly.tokens,
                      (n) => n.toLocaleString()
                    )}

                    {renderProgressBar(
                      'Requests',
                      usage.monthly.requests,
                      budget.monthly?.requests,
                      usage.percentages.monthly.requests,
                      (n) => n.toString()
                    )}

                    {renderProgressBar(
                      'Cost',
                      usage.monthly.estimatedCost,
                      budget.monthly?.estimatedCost,
                      usage.percentages.monthly.cost,
                      formatCost
                    )}

                    <div className="mt-4 pt-4 border-t space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span className="text-gray-600">Input Tokens</span>
                        <span className="font-medium">{formatNumber(usage.monthly.inputTokens)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600">Output Tokens</span>
                        <span className="font-medium">{formatNumber(usage.monthly.outputTokens)}</span>
                      </div>
                    </div>
                  </div>
                ) : (
                  <p className="text-gray-500 text-sm">No usage data available</p>
                )}
              </Card>
            </div>
          )}

          {/* Info Card */}
          {!editMode && (
            <Card className="mt-6 p-4 bg-blue-50 border-blue-200">
              <div className="flex items-start gap-3">
                <Activity className="h-5 w-5 text-blue-600 mt-0.5" />
                <div className="text-sm">
                  <p className="font-medium text-blue-900 mb-1">Budget Tracking Information</p>
                  <ul className="text-blue-800 space-y-1 list-disc list-inside">
                    <li>Budgets are tracked automatically as you make LLM requests</li>
                    <li>Costs are estimated based on current provider pricing</li>
                    <li>Daily budgets reset at midnight, monthly budgets reset on the 1st</li>
                    <li>You'll see warnings when usage reaches 90% of any limit</li>
                    <li>Budget tracking helps prevent unexpected billing surprises</li>
                  </ul>
                </div>
              </div>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
