import { XmppListenerManager } from '../networking/xmpp/listenerManager';

export class XmppMemoryMonitor {
  private static monitoringInterval: NodeJS.Timeout | null = null;
  private static warningThreshold = 10;
  private static criticalThreshold = 20;

  static startMonitoring(intervalMs: number = 5000): void {
    if (this.monitoringInterval) {
      this.stopMonitoring();
    }

    this.monitoringInterval = setInterval(() => {
      const count = XmppListenerManager.getActiveListenerCount();

      if (count >= this.criticalThreshold) {
        console.warn(
          `[XmppMemoryMonitor] CRITICAL: ${count} active XMPP listeners detected!`
        );
        XmppListenerManager.logActiveListeners();
      } else if (count >= this.warningThreshold) {
        console.warn(
          `[XmppMemoryMonitor] WARNING: ${count} active XMPP listeners detected`
        );
      } else if (process.env.NODE_ENV === 'development') {
        console.log(`[XmppMemoryMonitor] Active XMPP listeners: ${count}`);
      }
    }, intervalMs);

    console.log('[XmppMemoryMonitor] Started monitoring XMPP listeners');
  }

  static stopMonitoring(): void {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
      console.log('[XmppMemoryMonitor] Stopped monitoring XMPP listeners');
    }
  }

  static setThresholds(warning: number, critical: number): void {
    this.warningThreshold = warning;
    this.criticalThreshold = critical;
  }

  static getCurrentCount(): number {
    return XmppListenerManager.getActiveListenerCount();
  }

  static forceCleanup(): void {
    console.warn('[XmppMemoryMonitor] Force cleaning up all XMPP listeners');
    XmppListenerManager.clearAllListeners();
  }

  static getListenerInfo(): Array<{
    key: string;
    eventType: string;
    timestamp: number;
    age: number;
  }> {
    return XmppListenerManager.getActiveListenersInfo();
  }
}
