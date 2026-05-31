export interface ParsedEvent {
  timestamp: string;
  severity: string;
  event_type: string;
  source_ip?: string;
  dest_ip?: string;
  username?: string;
  message: string;
  raw_data: any;
  ocsf_class?: string;
  ocsf_category?: string;
}

export class LogParser {
  static detectFormat(rawData: string | object): string {
    if (typeof rawData === 'object') {
      if (rawData.hasOwnProperty('@timestamp') || rawData.hasOwnProperty('timestamp')) {
        return 'json';
      }
      if (rawData.hasOwnProperty('cef') || rawData.hasOwnProperty('CEF')) {
        return 'cef';
      }
      return 'json';
    }

    const text = rawData.toString();

    if (text.match(/^<\d+>/)) {
      return 'syslog';
    }

    if (text.match(/^CEF:/)) {
      return 'cef';
    }

    if (text.match(/^LEEF:/)) {
      return 'leef';
    }

    try {
      JSON.parse(text);
      return 'json';
    } catch {
      return 'unknown';
    }
  }

  static parseSyslog(text: string): ParsedEvent | null {
    const syslogRegex = /^<(\d+)>(\w{3}\s+\d+\s+\d+:\d+:\d+)\s+(\S+)\s+(\S+):\s*(.+)$/;
    const match = text.match(syslogRegex);

    if (!match) {
      return null;
    }

    const [, priority, timestamp, hostname, process, message] = match;
    const facility = Math.floor(parseInt(priority) / 8);
    const severity = parseInt(priority) % 8;

    const severityMap: { [key: number]: string } = {
      0: 'critical',
      1: 'critical',
      2: 'critical',
      3: 'high',
      4: 'medium',
      5: 'medium',
      6: 'low',
      7: 'info'
    };

    return {
      timestamp: new Date(timestamp).toISOString(),
      severity: severityMap[severity] || 'info',
      event_type: 'syslog',
      source_ip: hostname,
      message: message,
      raw_data: { facility, priority, hostname, process },
      ocsf_class: 'system_activity',
      ocsf_category: 'system'
    };
  }

  static parseCEF(text: string): ParsedEvent | null {
    const cefRegex = /^CEF:(\d+)\|([^|]+)\|([^|]+)\|([^|]+)\|([^|]+)\|([^|]+)\|([^|]+)\|(.*)$/;
    const match = text.match(cefRegex);

    if (!match) {
      return null;
    }

    const [, version, vendor, product, deviceVersion, signatureId, name, severity, extension] = match;

    const extensionFields: { [key: string]: string } = {};
    const extRegex = /(\w+)=([^\s]+(?:\s(?!\w+=)[^\s]+)*)/g;
    let extMatch;
    while ((extMatch = extRegex.exec(extension)) !== null) {
      extensionFields[extMatch[1]] = extMatch[2];
    }

    const severityMap: { [key: string]: string } = {
      '0': 'low',
      '1': 'low',
      '2': 'low',
      '3': 'low',
      '4': 'medium',
      '5': 'medium',
      '6': 'medium',
      '7': 'high',
      '8': 'high',
      '9': 'critical',
      '10': 'critical'
    };

    return {
      timestamp: extensionFields.rt || new Date().toISOString(),
      severity: severityMap[severity] || 'medium',
      event_type: signatureId,
      source_ip: extensionFields.src,
      dest_ip: extensionFields.dst,
      username: extensionFields.suser || extensionFields.duser,
      message: name,
      raw_data: { vendor, product, deviceVersion, extension: extensionFields },
      ocsf_class: 'security_finding',
      ocsf_category: 'findings'
    };
  }

  static parseJSON(data: any): ParsedEvent | null {
    try {
      const obj = typeof data === 'string' ? JSON.parse(data) : data;

      const timestamp = obj.timestamp || obj['@timestamp'] || obj.time || new Date().toISOString();
      const severity = obj.severity || obj.level || 'info';
      const eventType = obj.event_type || obj.type || obj.event || 'unknown';
      const sourceIp = obj.source_ip || obj.src_ip || obj.source?.ip;
      const destIp = obj.dest_ip || obj.dst_ip || obj.destination?.ip;
      const username = obj.username || obj.user || obj.account;
      const message = obj.message || obj.msg || JSON.stringify(obj);

      return {
        timestamp,
        severity: severity.toLowerCase(),
        event_type: eventType,
        source_ip: sourceIp,
        dest_ip: destIp,
        username,
        message,
        raw_data: obj,
        ocsf_class: obj.ocsf_class || 'base_event',
        ocsf_category: obj.ocsf_category || 'system'
      };
    } catch (error) {
      return null;
    }
  }

  static parseLEEF(text: string): ParsedEvent | null {
    const leefRegex = /^LEEF:([^|]+)\|([^|]+)\|([^|]+)\|([^|]+)\|(.*)$/;
    const match = text.match(leefRegex);

    if (!match) {
      return null;
    }

    const [, version, vendor, product, eventId, attributes] = match;

    const fields: { [key: string]: string } = {};
    const attrRegex = /(\w+)=([^\t]+)/g;
    let attrMatch;
    while ((attrMatch = attrRegex.exec(attributes)) !== null) {
      fields[attrMatch[1]] = attrMatch[2];
    }

    return {
      timestamp: fields.devTime || new Date().toISOString(),
      severity: fields.sev || 'medium',
      event_type: eventId,
      source_ip: fields.src,
      dest_ip: fields.dst,
      username: fields.usrName,
      message: fields.msg || eventId,
      raw_data: { vendor, product, version, fields },
      ocsf_class: 'security_finding',
      ocsf_category: 'findings'
    };
  }

  static parse(rawData: string | object): ParsedEvent | null {
    const format = this.detectFormat(rawData);

    switch (format) {
      case 'syslog':
        return this.parseSyslog(rawData.toString());
      case 'cef':
        return this.parseCEF(rawData.toString());
      case 'leef':
        return this.parseLEEF(rawData.toString());
      case 'json':
        return this.parseJSON(rawData);
      default:
        return null;
    }
  }

  static normalizeToOCSF(parsed: ParsedEvent): any {
    const ocsfBase = {
      time: new Date(parsed.timestamp).getTime(),
      severity_id: this.getSeverityId(parsed.severity),
      severity: parsed.severity,
      class_name: parsed.ocsf_class || 'base_event',
      category_name: parsed.ocsf_category || 'system',
      activity_name: parsed.event_type,
      message: parsed.message,
      metadata: {
        version: '1.0.0',
        product: {
          name: 'SOC Intelligence Platform',
          vendor_name: 'Databricks'
        }
      },
      unmapped: parsed.raw_data
    };

    if (parsed.source_ip) {
      ocsfBase['src_endpoint'] = {
        ip: parsed.source_ip,
        port: parsed.raw_data?.src_port
      };
    }

    if (parsed.dest_ip) {
      ocsfBase['dst_endpoint'] = {
        ip: parsed.dest_ip,
        port: parsed.raw_data?.dst_port
      };
    }

    if (parsed.username) {
      ocsfBase['actor'] = {
        user: {
          name: parsed.username
        }
      };
    }

    return ocsfBase;
  }

  private static getSeverityId(severity: string): number {
    const map: { [key: string]: number } = {
      'info': 1,
      'low': 2,
      'medium': 3,
      'high': 4,
      'critical': 5
    };
    return map[severity.toLowerCase()] || 0;
  }
}
