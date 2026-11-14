import type { Component, ProjectData } from './types';

// Supply rates for light fittings are LA Lounge's fitting schedule (Rev A, 22/04/2026), ex GST.
// Install rates are indicative electrician rates (wiring and fit-off per point, ex GST) — edit to suit.
const L = 'LA Lounge';
const E = 'Electrician';
const A = 'Automation';

export const DEFAULT_LIBRARY: Component[] = [
  // Downlights
  { code: 'DL1', name: 'Inset plaster downlight (Deep Cover Adj)', category: 'Downlights', symbol: 'downlight', color: '#1d4ed8', control: 'DALI', supplier: L, supplyRate: 184, installRate: 135 },
  { code: 'DL3', name: 'General downlight (Blush Slim)', category: 'Downlights', symbol: 'downlight', color: '#2563eb', control: 'DALI', supplier: L, supplyRate: 90, installRate: 135 },
  { code: 'DL4', name: 'IP-rated downlight (Blush Slim Fixed)', category: 'Downlights', symbol: 'downlight', color: '#0e7490', control: 'DALI', supplier: L, supplyRate: 90, installRate: 135 },
  { code: 'DL5', name: 'Adjustable recessed art light (Bloom)', category: 'Downlights', symbol: 'adjustable', color: '#1e40af', control: 'DALI', supplier: L, supplyRate: 164, installRate: 135 },
  { code: 'DL6', name: 'Mini pin light (Eve)', category: 'Downlights', symbol: 'pinlight', color: '#3b82f6', control: 'DALI', supplier: L, supplyRate: 97, installRate: 135 },
  { code: 'DL7', name: 'IP-rated external downlight (Latto Extreme)', category: 'Downlights', symbol: 'downlight', color: '#92400e', control: 'DALI', supplier: L, supplyRate: 205, installRate: 135 },
  // Wall, pendant, spot
  { code: 'WL1', name: 'Decorative wall light (type TBC)', category: 'Wall lights & pendants', symbol: 'wall', color: '#7c3aed', control: 'DALI relay', supplier: L, supplyRate: 0, installRate: 180 },
  { code: 'WL2', name: 'IP-rated up/down wall light (Titan Two)', category: 'Wall lights & pendants', symbol: 'wall', color: '#92400e', control: 'DALI relay', supplier: L, supplyRate: 328, installRate: 180 },
  { code: 'P1', name: 'Decorative linear pendant (type TBC)', category: 'Wall lights & pendants', symbol: 'linear', color: '#be185d', control: 'DALI relay', supplier: L, supplyRate: 0, installRate: 320 },
  { code: 'P2', name: 'Decorative pendant (type TBC)', category: 'Wall lights & pendants', symbol: 'pendant', color: '#be185d', control: 'DALI relay', supplier: L, supplyRate: 0, installRate: 320 },
  { code: 'SP1', name: 'IP-rated spotlight (Titan One)', category: 'Wall lights & pendants', symbol: 'spot', color: '#92400e', control: 'DALI relay', supplier: L, supplyRate: 225, installRate: 135 },
  { code: 'SC1', name: 'Surface-mounted ceiling light', category: 'Wall lights & pendants', symbol: 'surface', color: '#6d28d9', control: 'DALI relay', supplier: L, supplyRate: 0, installRate: 160 },
  // LED profiles
  { code: 'LED1', name: 'LED profile, medium (G04) – per section', category: 'LED strips', symbol: 'strip', color: '#ca8a04', control: 'DALI', supplier: L, supplyRate: 82, installRate: 150 },
  { code: 'LED2', name: '45° LED profile (G06) – per section', category: 'LED strips', symbol: 'strip', color: '#a16207', control: 'DALI', supplier: L, supplyRate: 82, installRate: 150 },
  { code: 'LED3', name: 'Wall-washer LED profile, IP (G018) – per section', category: 'LED strips', symbol: 'strip', color: '#854d0e', control: 'DALI', supplier: L, supplyRate: 200, installRate: 150 },
  // Low level / external
  { code: 'LL1', name: 'Inset low-level light (Hush Mini Round)', category: 'Low-level & external', symbol: 'lowlevel', color: '#0f766e', control: 'DALI', supplier: L, supplyRate: 197, installRate: 135 },
  { code: 'LL2', name: 'Low-level light (Echo)', category: 'Low-level & external', symbol: 'lowlevel', color: '#115e59', control: 'DALI relay', supplier: L, supplyRate: 164, installRate: 135 },
  { code: 'LL3', name: 'Low-level wall light (Vader)', category: 'Low-level & external', symbol: 'lowlevel', color: '#134e4a', control: 'DALI relay', supplier: L, supplyRate: 154, installRate: 135 },
  { code: 'UP1', name: 'Inset uplighter (Hush Mini Round)', category: 'Low-level & external', symbol: 'uplight', color: '#0f766e', control: 'DALI', supplier: L, supplyRate: 197, installRate: 135 },
  { code: 'GS1', name: 'Garden spike (Titan Spike)', category: 'Low-level & external', symbol: 'spike', color: '#15803d', control: 'DALI relay', supplier: L, supplyRate: 169, installRate: 180 },
  { code: 'LP', name: 'LED panel light', category: 'Low-level & external', symbol: 'panel', color: '#475569', control: 'DALI', supplier: L, supplyRate: 184, installRate: 135 },
  { code: 'FAN', name: 'Ceiling fan (wiring)', category: 'Low-level & external', symbol: 'fan', color: '#334155', control: 'Phase dim', supplier: E, supplyRate: 0, installRate: 135 },
  // Control
  { code: 'KP', name: 'Lighting keypad', category: 'Control', symbol: 'keypad', color: '#9333ea', control: 'Control device', supplier: A, supplyRate: 467, installRate: 120 },
  { code: 'MS', name: 'Ceiling motion sensor', category: 'Control', symbol: 'sensor', color: '#a855f7', control: 'Control device', supplier: A, supplyRate: 280, installRate: 120 },
  { code: 'TS', name: 'Touchscreen', category: 'Control', symbol: 'touchscreen', color: '#7e22ce', control: 'Control device', supplier: A, supplyRate: 0, installRate: 150 },
  // Power
  { code: 'GPO', name: 'Double power point', category: 'Power', symbol: 'gpo', color: '#b91c1c', control: 'Power', supplier: E, supplyRate: 0, installRate: 165 },
  { code: 'GPO-S', name: 'Single power point', category: 'Power', symbol: 'gpo', color: '#dc2626', control: 'Power', supplier: E, supplyRate: 0, installRate: 150 },
  { code: 'USBC', name: 'Double power point with USB-C', category: 'Power', symbol: 'usb', color: '#b91c1c', control: 'Power', supplier: E, supplyRate: 0, installRate: 295 },
  { code: 'GPO-WP', name: 'Weatherproof double power point', category: 'Power', symbol: 'gpo-wp', color: '#7f1d1d', control: 'Power', supplier: E, supplyRate: 0, installRate: 210 },
  { code: 'EXF', name: 'Exhaust fan (wiring)', category: 'Power', symbol: 'exhaust', color: '#57534e', control: 'On/off', supplier: E, supplyRate: 0, installRate: 165 },
  { code: 'HTR', name: 'Heated towel rail circuit', category: 'Power', symbol: 'towel', color: '#9a3412', control: 'On/off', supplier: E, supplyRate: 0, installRate: 180 },
  { code: 'CCT', name: 'Dedicated circuit (appliance, EV, pool…)', category: 'Power', symbol: 'circuit', color: '#991b1b', control: 'Power', supplier: E, supplyRate: 0, installRate: 400 },
  { code: 'SMK', name: 'Smoke alarm 240V', category: 'Power', symbol: 'smoke', color: '#44403c', control: 'Power', supplier: E, supplyRate: 0, installRate: 450 },
  // Data / AV / security
  { code: 'DATA', name: 'Data point (CAT6)', category: 'Data, AV & security', symbol: 'data', color: '#0369a1', control: 'Low voltage', supplier: E, supplyRate: 0, installRate: 165 },
  { code: 'TV', name: 'TV point (CAT6 + coax)', category: 'Data, AV & security', symbol: 'tv', color: '#0369a1', control: 'Low voltage', supplier: E, supplyRate: 0, installRate: 165 },
  { code: 'WAP', name: 'Wi-Fi access point', category: 'Data, AV & security', symbol: 'wap', color: '#0284c7', control: 'Low voltage', supplier: A, supplyRate: 0, installRate: 165 },
  { code: 'CAM', name: 'CCTV camera', category: 'Data, AV & security', symbol: 'camera', color: '#075985', control: 'Low voltage', supplier: A, supplyRate: 0, installRate: 165 },
  { code: 'INT', name: 'Intercom / access point', category: 'Data, AV & security', symbol: 'intercom', color: '#0c4a6e', control: 'Low voltage', supplier: A, supplyRate: 0, installRate: 165 },
  { code: 'PIR', name: 'Security motion detector (PIR)', category: 'Data, AV & security', symbol: 'sensor', color: '#be123c', control: 'Low voltage', supplier: A, supplyRate: 0, installRate: 120 },
  { code: 'SIR', name: 'Alarm siren / screamer', category: 'Data, AV & security', symbol: 'speaker', color: '#be123c', control: 'Low voltage', supplier: A, supplyRate: 0, installRate: 120 },
  { code: 'SPK', name: 'In-ceiling speaker', category: 'Data, AV & security', symbol: 'speaker', color: '#164e63', control: 'Low voltage', supplier: A, supplyRate: 0, installRate: 120 },
];

export const SYMBOL_KINDS: Component['symbol'][] = [
  'downlight', 'pinlight', 'adjustable', 'wall', 'pendant', 'linear', 'strip', 'lowlevel', 'uplight', 'spike', 'spot', 'panel', 'surface', 'fan',
  'keypad', 'sensor', 'touchscreen', 'gpo', 'usb', 'gpo-wp', 'data', 'tv', 'wap', 'camera', 'intercom', 'speaker', 'exhaust', 'towel', 'smoke', 'circuit', 'generic',
];

export const CONTROLS: Component['control'][] = ['DALI', 'DALI relay', 'Phase dim', 'On/off', 'Control device', 'Power', 'Low voltage', 'Other'];

export function newProjectData(): ProjectData {
  return {
    schema: 1,
    dwellings: ['Dwelling', 'External'],
    symbolSize: 4,
    copies: 2,
    library: structuredClone(DEFAULT_LIBRARY),
    floors: [],
  };
}
