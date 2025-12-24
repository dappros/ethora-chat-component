interface ActionLogEntry {
  timestamp: number;
  action: any;
  state: any;
  stackTrace: string;
}

class ActionLogger {
  private logs: ActionLogEntry[] = [];
  private maxLogs = 100;

  logAction(action: any, state: any) {
    if (process.env.NODE_ENV !== 'development') {
      return;
    }

    const entry: ActionLogEntry = {
      timestamp: Date.now(),
      action,
      state,
      stackTrace: new Error().stack || '',
    };

    this.logs.push(entry);

    if (this.logs.length > this.maxLogs) {
      this.logs = this.logs.slice(-this.maxLogs);
    }

    if (typeof action !== 'object' || action === null) {
      console.error('🚨 Non-plain object action detected:', action);
      console.error('📋 Action type:', typeof action);
      console.error('🔍 Constructor:', action?.constructor?.name);
      console.error('📍 Stack trace:', entry.stackTrace);
    }

    if (!action.type) {
      console.error('🚨 Action missing type property:', action);
      console.error('📍 Stack trace:', entry.stackTrace);
    }
  }

  getLogs() {
    return [...this.logs];
  }

  clearLogs() {
    this.logs = [];
  }

  getRecentLogs(count: number = 10) {
    return this.logs.slice(-count);
  }
}

export const actionLogger = new ActionLogger();

export const actionLoggerMiddleware =
  (storeAPI: any) => (next: any) => (action: any) => {
    if (process.env.NODE_ENV === 'development') {
      actionLogger.logAction(action, storeAPI.getState());
    }
    return next(action);
  };
