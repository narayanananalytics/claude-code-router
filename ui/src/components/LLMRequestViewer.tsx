import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { api } from '@/lib/api';
import {
  X,
  RefreshCw,
  Trash2,
  Filter,
  ChevronLeft,
  ChevronRight,
  Activity,
  AlertCircle,
  CheckCircle,
  Clock,
  Database,
  TrendingUp
} from 'lucide-react';
import Editor from '@monaco-editor/react';

interface LLMRequest {
  timestamp: string;
  reqId: string;
  sessionId?: string;
  type: 'request' | 'response' | 'error';
  provider?: string;
  model?: string;
  requestBody?: any;
  responseBody?: any;
  error?: any;
  duration?: number;
  usage?: { input_tokens?: number; output_tokens?: number };
}

interface LLMRequestViewerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  showToast?: (message: string, type: 'success' | 'error' | 'warning') => void;
}

interface Stats {
  totalRequests: number;
  totalResponses: number;
  totalErrors: number;
  providers: Record<string, number>;
  models: Record<string, number>;
}

export function LLMRequestViewer({ open, onOpenChange, showToast }: LLMRequestViewerProps) {
  const [requests, setRequests] = useState<LLMRequest[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [selectedRequest, setSelectedRequest] = useState<LLMRequest | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalRequests, setTotalRequests] = useState(0);
  const [filters, setFilters] = useState({
    provider: '',
    model: '',
    type: '' as '' | 'request' | 'response' | 'error',
    sessionId: '',
  });
  const [showFilters, setShowFilters] = useState(false);

  const pageSize = 50;

  useEffect(() => {
    if (open) {
      loadRequests();
      loadStats();
    }
  }, [open, currentPage, filters]);

  const loadRequests = async () => {
    try {
      setIsLoading(true);
      const params: any = {
        limit: pageSize,
        offset: (currentPage - 1) * pageSize,
      };

      if (filters.provider) params.provider = filters.provider;
      if (filters.model) params.model = filters.model;
      if (filters.type) params.type = filters.type;
      if (filters.sessionId) params.sessionId = filters.sessionId;

      const response = await api.getLLMRequests(params);
      setRequests(response.requests);
      setTotalRequests(response.total);
    } catch (error) {
      console.error('Failed to load LLM requests:', error);
      if (showToast) {
        showToast('Failed to load LLM requests: ' + (error as Error).message, 'error');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const loadStats = async () => {
    try {
      const response = await api.getLLMRequestStats();
      setStats(response);
    } catch (error) {
      console.error('Failed to load stats:', error);
    }
  };

  const clearLogs = async () => {
    if (!confirm('Are you sure you want to clear all LLM request logs?')) {
      return;
    }

    try {
      await api.clearLLMRequests();
      setRequests([]);
      setTotalRequests(0);
      setSelectedRequest(null);
      loadStats();
      if (showToast) {
        showToast('LLM request logs cleared successfully', 'success');
      }
    } catch (error) {
      console.error('Failed to clear logs:', error);
      if (showToast) {
        showToast('Failed to clear logs: ' + (error as Error).message, 'error');
      }
    }
  };

  const formatTimestamp = (timestamp: string) => {
    return new Date(timestamp).toLocaleString();
  };

  const formatDuration = (duration?: number) => {
    if (!duration) return 'N/A';
    if (duration < 1000) return `${duration}ms`;
    return `${(duration / 1000).toFixed(2)}s`;
  };

  const getTypeBadge = (type: string) => {
    const colors = {
      request: 'bg-blue-100 text-blue-800',
      response: 'bg-green-100 text-green-800',
      error: 'bg-red-100 text-red-800',
    };
    return colors[type as keyof typeof colors] || 'bg-gray-100 text-gray-800';
  };

  const totalPages = Math.ceil(totalRequests / pageSize);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 bg-white flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b p-4 bg-gradient-to-r from-blue-50 to-indigo-50">
        <div className="flex items-center gap-3">
          <Activity className="h-6 w-6 text-blue-600" />
          <div>
            <h2 className="text-xl font-bold text-gray-900">LLM Request Logs</h2>
            <p className="text-sm text-gray-600">Track and analyze LLM provider requests</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowFilters(!showFilters)}
          >
            <Filter className="h-4 w-4 mr-2" />
            Filters
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              loadRequests();
              loadStats();
            }}
          >
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={clearLogs}
          >
            <Trash2 className="h-4 w-4 mr-2" />
            Clear All
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => onOpenChange(false)}
          >
            <X className="h-4 w-4 mr-2" />
            Close
          </Button>
        </div>
      </div>

      {/* Stats Dashboard */}
      {stats && (
        <div className="grid grid-cols-5 gap-4 p-4 bg-gray-50 border-b">
          <Card className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Total Requests</p>
                <p className="text-2xl font-bold text-blue-600">{stats.totalRequests}</p>
              </div>
              <Database className="h-8 w-8 text-blue-600 opacity-50" />
            </div>
          </Card>
          <Card className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Responses</p>
                <p className="text-2xl font-bold text-green-600">{stats.totalResponses}</p>
              </div>
              <CheckCircle className="h-8 w-8 text-green-600 opacity-50" />
            </div>
          </Card>
          <Card className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Errors</p>
                <p className="text-2xl font-bold text-red-600">{stats.totalErrors}</p>
              </div>
              <AlertCircle className="h-8 w-8 text-red-600 opacity-50" />
            </div>
          </Card>
          <Card className="p-4">
            <div>
              <p className="text-sm text-gray-600 mb-2">Top Provider</p>
              {Object.entries(stats.providers).length > 0 ? (
                <p className="text-lg font-bold text-indigo-600">
                  {Object.entries(stats.providers).sort(([,a], [,b]) => b - a)[0]?.[0] || 'N/A'}
                </p>
              ) : (
                <p className="text-lg font-bold text-gray-400">N/A</p>
              )}
            </div>
          </Card>
          <Card className="p-4">
            <div>
              <p className="text-sm text-gray-600 mb-2">Top Model</p>
              {Object.entries(stats.models).length > 0 ? (
                <p className="text-lg font-bold text-purple-600 truncate">
                  {Object.entries(stats.models).sort(([,a], [,b]) => b - a)[0]?.[0] || 'N/A'}
                </p>
              ) : (
                <p className="text-lg font-bold text-gray-400">N/A</p>
              )}
            </div>
          </Card>
        </div>
      )}

      {/* Filters */}
      {showFilters && (
        <div className="grid grid-cols-4 gap-4 p-4 bg-blue-50 border-b">
          <div>
            <label className="text-sm font-medium mb-1 block">Provider</label>
            <Input
              placeholder="Filter by provider"
              value={filters.provider}
              onChange={(e) => {
                setFilters({ ...filters, provider: e.target.value });
                setCurrentPage(1);
              }}
            />
          </div>
          <div>
            <label className="text-sm font-medium mb-1 block">Model</label>
            <Input
              placeholder="Filter by model"
              value={filters.model}
              onChange={(e) => {
                setFilters({ ...filters, model: e.target.value });
                setCurrentPage(1);
              }}
            />
          </div>
          <div>
            <label className="text-sm font-medium mb-1 block">Type</label>
            <select
              className="w-full border rounded px-3 py-2 text-sm"
              value={filters.type}
              onChange={(e) => {
                setFilters({ ...filters, type: e.target.value as any });
                setCurrentPage(1);
              }}
            >
              <option value="">All</option>
              <option value="request">Request</option>
              <option value="response">Response</option>
              <option value="error">Error</option>
            </select>
          </div>
          <div>
            <label className="text-sm font-medium mb-1 block">Session ID</label>
            <Input
              placeholder="Filter by session"
              value={filters.sessionId}
              onChange={(e) => {
                setFilters({ ...filters, sessionId: e.target.value });
                setCurrentPage(1);
              }}
            />
          </div>
        </div>
      )}

      {/* Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Request List */}
        <div className="w-1/3 border-r flex flex-col">
          <div className="p-3 border-b bg-gray-50">
            <p className="text-sm font-medium text-gray-700">
              Showing {requests.length} of {totalRequests} requests
            </p>
          </div>
          <div className="flex-1 overflow-y-auto">
            {isLoading ? (
              <div className="flex items-center justify-center h-32">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
              </div>
            ) : requests.length > 0 ? (
              <div className="divide-y">
                {requests.map((request) => (
                  <div
                    key={`${request.reqId}-${request.timestamp}`}
                    className={`p-3 cursor-pointer hover:bg-gray-50 transition-colors ${
                      selectedRequest === request ? 'bg-blue-50 border-l-4 border-blue-600' : ''
                    }`}
                    onClick={() => setSelectedRequest(request)}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <Badge className={getTypeBadge(request.type)}>
                        {request.type}
                      </Badge>
                      {request.duration && (
                        <span className="text-xs text-gray-500 flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {formatDuration(request.duration)}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-gray-600 truncate mb-1">
                      <strong>ID:</strong> {request.reqId}
                    </p>
                    {request.provider && (
                      <p className="text-xs text-gray-600 truncate mb-1">
                        <strong>Provider:</strong> {request.provider}
                      </p>
                    )}
                    {request.model && (
                      <p className="text-xs text-gray-600 truncate mb-1">
                        <strong>Model:</strong> {request.model}
                      </p>
                    )}
                    <p className="text-xs text-gray-500">{formatTimestamp(request.timestamp)}</p>
                    {request.usage && (
                      <div className="mt-2 text-xs text-gray-600">
                        <span className="bg-gray-100 px-2 py-1 rounded mr-2">
                          ↓ {request.usage.input_tokens || 0}
                        </span>
                        <span className="bg-gray-100 px-2 py-1 rounded">
                          ↑ {request.usage.output_tokens || 0}
                        </span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center h-32 text-gray-500">
                <Database className="h-12 w-12 mb-4 text-gray-300" />
                <p>No requests found</p>
              </div>
            )}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="p-3 border-t bg-gray-50 flex items-center justify-between">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={currentPage === 1}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="text-sm text-gray-600">
                Page {currentPage} of {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          )}
        </div>

        {/* Request Detail */}
        <div className="flex-1 flex flex-col">
          {selectedRequest ? (
            <>
              <div className="p-4 border-b bg-gray-50">
                <h3 className="font-semibold text-lg mb-2">Request Details</h3>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <p className="text-gray-600">Request ID:</p>
                    <p className="font-mono">{selectedRequest.reqId}</p>
                  </div>
                  {selectedRequest.sessionId && (
                    <div>
                      <p className="text-gray-600">Session ID:</p>
                      <p className="font-mono">{selectedRequest.sessionId}</p>
                    </div>
                  )}
                  <div>
                    <p className="text-gray-600">Timestamp:</p>
                    <p>{formatTimestamp(selectedRequest.timestamp)}</p>
                  </div>
                  <div>
                    <p className="text-gray-600">Duration:</p>
                    <p>{formatDuration(selectedRequest.duration)}</p>
                  </div>
                </div>
              </div>
              <div className="flex-1 overflow-hidden">
                <Editor
                  height="100%"
                  defaultLanguage="json"
                  value={JSON.stringify(selectedRequest, null, 2)}
                  theme="vs"
                  options={{
                    readOnly: true,
                    minimap: { enabled: true },
                    fontSize: 13,
                    wordWrap: 'on',
                  }}
                />
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center text-gray-500">
              <div className="text-center">
                <Activity className="h-16 w-16 mx-auto mb-4 text-gray-300" />
                <p>Select a request to view details</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
