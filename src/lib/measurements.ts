import type { SupportScheme } from '@/lib/types';

/** 桩号换算为米，支持 K3600+651.30；不对已有字符串进行猜测性修复。 */
export function chainageToMeters(value: string): number {
  const match = /^K(\d+)\+(\d{1,3}(?:\.\d+)?)$/i.exec(value.trim());
  if (!match || Number(match[2]) >= 1000) throw new Error(`无效里程桩号：${value}`);
  return Number(match[1]) * 1000 + Number(match[2]);
}

export function advanceToMeters(value: string): number | null {
  const match = /^(\d+(?:\.\d+)?)\s*m$/i.exec(value.trim());
  return match ? Number(match[1]) : null;
}

export function durationToMinutes(value: string): number | null {
  const match = /循环总时长\s*(\d+)小时(?:\s*(\d+)分)?/.exec(value);
  if (!match || Number(match[2] ?? 0) >= 60) return null;
  return Number(match[1]) * 60 + Number(match[2] ?? 0);
}

/** 只转换明确带单位的配置值；无法识别的描述保留原字段，数值返回 null。 */
export function supportParameters(input: Omit<SupportScheme, 'no' | 'custom'>) {
  const measure = (text: string, pattern: RegExp, factor = 1): number | null => {
    const match = pattern.exec(text);
    return match ? Number(match[1]) * factor : null;
  };
  return {
    steel_spacing_mm: measure(input.steel, /@\s*(\d+(?:\.\d+)?)\s*cm\b/i, 10),
    shotcrete_thickness_mm: measure(input.shot, /(?:^|,\s*)(\d+(?:\.\d+)?)\s*cm\b/i, 10),
    anchor_length_m: measure(input.anchor, /(?:L=|,\s*)(\d+(?:\.\d+)?)\s*m\b/i),
    advance_ring_spacing_mm: measure(input.advRing, /^(\d+(?:\.\d+)?)\s*cm$/i, 10),
    advance_length_m: advanceToMeters(input.advLen),
    secondary_lining_thickness_mm: measure(input.thick, /^(\d+(?:\.\d+)?)\s*cm$/i, 10),
    reference_advance_m: advanceToMeters(input.advRate),
  };
}
