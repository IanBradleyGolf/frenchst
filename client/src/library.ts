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
  { code: 'DL8', name: 'Basic IP-rated downlight, low-glare, 4000K, on/off', category: 'Downlights', symbol: 'downlight', color: '#1d4ed8', control: 'On/off', supplier: E, supplyRate: 0, installRate: 0, notes: 'Recessed LED (low glare), white trim. For utility spaces and the basement stair; switched with the garage circuit.' },
  { code: 'DL9', name: 'IP65 downlight, low-glare, 3000K, on/off (wet areas)', category: 'Downlights', symbol: 'downlight', color: '#0e7490', control: 'On/off', supplier: E, supplyRate: 0, installRate: 0, notes: 'Recessed LED, IP65 so it can go over the shower or bath, low glare, warm 3000K, white trim. Not DALI.' },
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
  { code: 'LED2R', name: 'LED profile around ceiling recess, 45° (G06) – per metre', category: 'LED strips', symbol: 'loop', color: '#059669', control: 'DALI', supplier: L, supplyRate: 0, installRate: 0, defaultLen: 3000, defaultWid: 2000, notes: 'The LED2 45° profile run around the perimeter of a ceiling recess (coffer), as drawn in green on the Switch plans. Schedule counts the perimeter in metres.' },
  { code: 'LED3', name: 'Wall-washer LED profile, IP (G018) – per section', category: 'LED strips', symbol: 'strip', color: '#854d0e', control: 'DALI', supplier: L, supplyRate: 200, installRate: 150 },
  // Low level / external
  { code: 'LL1', name: 'Inset low-level light (Hush Mini Round)', category: 'Low-level & external', symbol: 'lowlevel', color: '#0f766e', control: 'DALI', supplier: L, supplyRate: 197, installRate: 135 },
  { code: 'LL2', name: 'Low-level light (Echo)', category: 'Low-level & external', symbol: 'lowlevel', color: '#115e59', control: 'DALI relay', supplier: L, supplyRate: 164, installRate: 135 },
  { code: 'LL3', name: 'Low-level wall light (Vader)', category: 'Low-level & external', symbol: 'lowlevel', color: '#134e4a', control: 'DALI relay', supplier: L, supplyRate: 154, installRate: 135 },
  { code: 'UP1', name: 'Inset uplighter (Hush Mini Round)', category: 'Low-level & external', symbol: 'uplight', color: '#0f766e', control: 'DALI', supplier: L, supplyRate: 197, installRate: 135 },
  { code: 'GS1', name: 'Garden spike (Titan Spike)', category: 'Low-level & external', symbol: 'spike', color: '#15803d', control: 'DALI relay', supplier: L, supplyRate: 169, installRate: 180 },
  { code: 'LP', name: 'LED panel light', category: 'Low-level & external', symbol: 'panel', color: '#475569', control: 'DALI', supplier: L, supplyRate: 184, installRate: 135 },
  { code: 'FAN', name: 'Ceiling fan (wiring + fan controller)', category: 'Fans & heating', symbol: 'fan', color: '#334155', control: 'Phase dim', supplier: E, supplyRate: 0, installRate: 135 },
  // Control
  { code: 'SWL', name: 'Light switch, on/off (same range as the house)', category: 'Control', symbol: 'switch', color: '#7c3aed', control: 'On/off', supplier: E, supplyRate: 0, installRate: 0, notes: 'Conventional 240V switch mechanism. Use 2 or 3 gang plates where several circuits share a spot (e.g. lights + exhaust fan).' },
  { code: 'KP', name: 'Lighting keypad', category: 'Control', symbol: 'keypad', color: '#9333ea', control: 'Control device', supplier: A, supplyRate: 467, installRate: 120 },
  { code: 'MS', name: 'Ceiling motion sensor', category: 'Control', symbol: 'sensor', color: '#a855f7', control: 'Control device', supplier: A, supplyRate: 280, installRate: 120 },
  { code: 'TS', name: 'Touchscreen (Control4 in-wall, whole-house control)', category: 'Control', symbol: 'touchscreen', color: '#7e22ce', control: 'Control device', supplier: A, supplyRate: 0, installRate: 150, notes: 'Control4 in-wall touchscreen: lights, scenes, music, TV, climate, blinds, cameras, intercom. Kitchen 11"; front door and garage lift entry smaller (8" or 10") - confirm model with Switch.' },
  { code: 'BLC', name: 'Motorised blind controller', category: 'Control', symbol: 'blind', color: '#0f766e', control: 'Control device', supplier: A, supplyRate: 0, installRate: 0, notes: 'One per motorised blind or curtain motor; place it at the blind head box. 240V motors: an interlocked up/down relay (curtain controller) channel in the lighting control board, with the switched feed run to the head box. Low-voltage or bus-controlled motors: power supply plus control cable instead. Motor and blind are by the blind supplier - confirm the motor type before rough-in.' },
  // Linear & battens
  { code: 'LIN1', name: 'Surface linear LED profile, white, 4000K high output (per metre)', category: 'Linear & battens', symbol: 'profile', color: '#0891b2', control: 'On/off', supplier: E, supplyRate: 0, installRate: 0, defaultLen: 4500, notes: 'Surface-mounted aluminium profile with opal diffuser. On/off driver in an accessible location; switched by a relay channel and occupancy sensor. Rates are per metre.' },
  { code: 'LIN2', name: 'LED strip in aluminium channel, warm white 2700-3000K, CRI 90+, DALI dimmable (wine racks, per metre)', category: 'Linear & battens', symbol: 'profile', color: '#b45309', control: 'DALI', supplier: E, supplyRate: 0, installRate: 0, defaultLen: 3000, notes: 'Behind or under the wine racks, diffused, 50-100 mm gap to the wall. Driven by a DALI-2 constant-voltage driver (DRVD) outside the cellar. Rates per metre.' },
  { code: 'DRVD', name: 'DALI-2 constant-voltage LED driver 24V (accessible location)', category: 'Linear & battens', symbol: 'driver', color: '#92400e', control: 'DALI', supplier: E, supplyRate: 0, installRate: 0, notes: 'DT6 (single colour), sized for the strip run. Own DALI address. Must stay accessible.' },
  { code: 'DRV', name: 'LED driver 24V DC, on/off (accessible location)', category: 'Linear & battens', symbol: 'driver', color: '#0e7490', control: 'On/off', supplier: E, supplyRate: 0, installRate: 0, notes: 'One per profile run, or one shared driver sized for all runs. Must stay accessible (hatch, cupboard or wall box).' },
  { code: 'BAT', name: 'Slim LED batten 1200mm, 4000K', category: 'Linear & battens', symbol: 'linear', color: '#155e75', control: 'On/off', supplier: E, supplyRate: 0, installRate: 0 },
  // Power
  { code: 'GPO', name: 'Double power point', category: 'Power', symbol: 'gpo', color: '#b91c1c', control: 'Power', supplier: E, supplyRate: 0, installRate: 165 },
  { code: 'GPO-S', name: 'Single power point', category: 'Power', symbol: 'gpo', color: '#dc2626', control: 'Power', supplier: E, supplyRate: 0, installRate: 150 },
  { code: 'USBC', name: 'Double power point with USB-C', category: 'Power', symbol: 'usb', color: '#b91c1c', control: 'Power', supplier: E, supplyRate: 0, installRate: 295 },
  { code: 'GPO-WP', name: 'Weatherproof double power point', category: 'Power', symbol: 'gpo-wp', color: '#7f1d1d', control: 'Power', supplier: E, supplyRate: 0, installRate: 210 },
  { code: 'GPO-FL', name: 'Floor power point (double, in-floor box)', category: 'Power', symbol: 'gpo', color: '#c2410c', control: 'Power', supplier: E, supplyRate: 0, installRate: 0, notes: 'Recessed floor box with a double outlet, set into the slab/floor finish. Position to suit the furniture layout.' },
  { code: 'EXF', name: 'Exhaust fan (wiring)', category: 'Fans & heating', symbol: 'exhaust', color: '#57534e', control: 'On/off', supplier: E, supplyRate: 0, installRate: 165 },
  { code: 'HTR', name: 'Heated towel rail circuit', category: 'Fans & heating', symbol: 'towel', color: '#9a3412', control: 'On/off', supplier: E, supplyRate: 0, installRate: 180 },
  { code: 'CCT', name: 'Dedicated circuit (appliance, EV, pool…)', category: 'Power', symbol: 'circuit', color: '#991b1b', control: 'Power', supplier: E, supplyRate: 0, installRate: 400 },
  { code: 'EVC', name: 'EV charger circuit, 32A single-phase, terminated at isolation switch', category: 'Power', symbol: 'ev', color: '#15803d', control: 'Power', supplier: E, supplyRate: 0, installRate: 0, notes: 'Dedicated 32A circuit from the switchboard on its own breaker/RCD, run to a lockable 32A isolation switch at the charger position. Charger itself supplied and fitted later. Cable sized for the run length; isolator weatherproof (IP66) if exposed.' },
  { code: 'MB', name: 'Meter box, galvanised (NSW), 3-phase metering, main switch and earthing system', category: 'Power', symbol: 'meterbox', color: '#374151', control: 'Power', supplier: E, supplyRate: 0, installRate: 0, notes: 'Galvanised steel meter enclosure to the NSW Service and Installation Rules and the local network (Ausgrid) requirements, with 3-phase meter panel, service fuses/meter protection device, main switch, and main earthing system (MEN link, main earth conductor and earth electrode). Meter itself is fitted by the electricity retailer\'s metering provider; service connection by a Level 2 ASP.' },
  { code: 'SMK', name: 'Smoke alarm 240V', category: 'Power', symbol: 'smoke', color: '#44403c', control: 'Power', supplier: E, supplyRate: 0, installRate: 450 },
  // Data / AV / security
  { code: 'DATA', name: 'Data point (CAT6)', category: 'Data, AV & security', symbol: 'data', color: '#0369a1', control: 'Low voltage', supplier: E, supplyRate: 0, installRate: 165 },
  { code: 'TV', name: 'TV point (CAT6 + coax)', category: 'Data, AV & security', symbol: 'tv', color: '#0369a1', control: 'Low voltage', supplier: E, supplyRate: 0, installRate: 165 },
  { code: 'WAP', name: 'Wi-Fi access point', category: 'Data, AV & security', symbol: 'wap', color: '#0284c7', control: 'Low voltage', supplier: A, supplyRate: 0, installRate: 165 },
  { code: 'CAM', name: 'CCTV camera', category: 'Data, AV & security', symbol: 'camera', color: '#075985', control: 'Low voltage', supplier: A, supplyRate: 0, installRate: 165 },
  { code: 'INT', name: 'Intercom / access point', category: 'Data, AV & security', symbol: 'intercom', color: '#0c4a6e', control: 'Low voltage', supplier: A, supplyRate: 0, installRate: 165 },
  { code: 'PIR', name: 'Security motion detector (PIR)', category: 'Data, AV & security', symbol: 'sensor', color: '#be123c', control: 'Low voltage', supplier: A, supplyRate: 0, installRate: 120 },
  { code: 'SIR', name: 'Alarm siren / screamer', category: 'Data, AV & security', symbol: 'speaker', color: '#be123c', control: 'Low voltage', supplier: A, supplyRate: 0, installRate: 120 },
  { code: 'OCS', name: 'Ceiling occupancy sensor 240V, dual-technology, standalone (auto on / auto off)', category: 'Control', symbol: 'occsensor', color: '#6d28d9', control: 'On/off', supplier: E, supplyRate: 0, installRate: 0, notes: 'Australian-approved 360° dual-technology ceiling sensor (PIR + microwave/ultrasonic, picks up minor movement such as reading) that switches the lights directly (e.g. Clipsal 752 dual-technology, HPM or Hager equivalent). Automatic mode, 10–15 minute timeout. Not on the automation.' },
  { code: 'DCT', name: 'Door contact (reed switch) to automation', category: 'Control', symbol: 'contact', color: '#6d28d9', control: 'Control device', supplier: A, supplyRate: 0, installRate: 0, notes: 'Tells the automation the door opened/closed, so a room seen occupied stays lit until the door opens again.' },
  { code: 'PIRS', name: 'PIR sensor wall switch, vacancy mode (manual on / auto off)', category: 'Control', symbol: 'pirswitch', color: '#6d28d9', control: 'On/off', supplier: E, supplyRate: 0, installRate: 0, notes: 'Australian-approved, from the same switch range as the rest of the house (e.g. Clipsal Iconic 41EPIRM). Set to vacancy mode; mask the lens on the stair/lobby side. Switches the lights directly - standalone, not on the automation.' },
  { code: 'PB', name: 'Push-button switch (input to lighting controller)', category: 'Control', symbol: 'pushbutton', color: '#7c3aed', control: 'Control device', supplier: A, supplyRate: 0, installRate: 0, notes: 'Retractive button wired to a lighting controller input; toggles a relay circuit or scene, so automation and "all off" still work. Not a 240V switch in the light circuit.' },
  { code: 'PBD', name: 'DALI push-button, 1 button (wall button on the DALI bus)', category: 'Control', symbol: 'pushbutton', color: '#a21caf', control: 'Control device', supplier: E, supplyRate: 0, installRate: 0, notes: 'Single-gang plate from the house switch range with one momentary (bell-press) mechanism, wired to a DALI-2 push-button input module in the wall box. Short press turns the assigned DALI lights on/off together (e.g. stair downlights and low-level stair lights); long press dims. Fit one at each location (e.g. top and bottom of the stairs) - no 2-way/3-way switching or strappers, and no 240V switch in the light circuit.' },
  { code: 'RACK', name: 'Rack enclosure (SP1, floorstanding 600x600, 18RU)', category: 'Data, AV & security', symbol: 'rack', color: '#92400e', control: 'Low voltage', supplier: A, supplyRate: 0, installRate: 0 },
  { code: 'AK', name: 'Security alarm keypad (Ness Navigator touchscreen)', category: 'Data, AV & security', symbol: 'alarm', color: '#be123c', control: 'Low voltage', supplier: A, supplyRate: 0, installRate: 120 },
  { code: 'ACK', name: 'Access control keypad (Rosslare, prox & PIN)', category: 'Data, AV & security', symbol: 'access', color: '#be123c', control: 'Low voltage', supplier: A, supplyRate: 0, installRate: 120 },
  { code: 'ES', name: 'Electric door strike', category: 'Data, AV & security', symbol: 'strike', color: '#be123c', control: 'Low voltage', supplier: A, supplyRate: 0, installRate: 120 },
  { code: 'DC', name: 'Door control (6-core to security panel)', category: 'Data, AV & security', symbol: 'doorctl', color: '#be123c', control: 'Low voltage', supplier: A, supplyRate: 0, installRate: 120 },
  { code: 'SB', name: 'Soundbar point (Sonos Arc)', category: 'Data, AV & security', symbol: 'soundbar', color: '#164e63', control: 'Low voltage', supplier: A, supplyRate: 0, installRate: 120 },
  { code: 'SW', name: 'Subwoofer point (Sonos Sub)', category: 'Data, AV & security', symbol: 'sub', color: '#164e63', control: 'Low voltage', supplier: A, supplyRate: 0, installRate: 120 },
  { code: 'SPK', name: 'In-ceiling speaker', category: 'Data, AV & security', symbol: 'speaker', color: '#164e63', control: 'Low voltage', supplier: A, supplyRate: 0, installRate: 120 },
];

export const SYMBOL_KINDS: Component['symbol'][] = [
  'downlight', 'pinlight', 'adjustable', 'wall', 'pendant', 'linear', 'strip', 'lowlevel', 'uplight', 'spike', 'spot', 'panel', 'surface', 'fan',
  'keypad', 'sensor', 'loop', 'pushbutton', 'pirswitch', 'occsensor', 'switch', 'contact', 'profile', 'driver', 'rack', 'alarm', 'access', 'strike', 'doorctl', 'soundbar', 'sub', 'touchscreen', 'blind', 'gpo', 'usb', 'gpo-wp', 'data', 'tv', 'wap', 'camera', 'intercom', 'speaker', 'exhaust', 'towel', 'smoke', 'circuit', 'ev', 'meterbox', 'generic',
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

/** Category display order; anything else follows alphabetically. */
export const CATEGORY_ORDER = ['Downlights', 'Wall lights & pendants', 'LED strips', 'Linear & battens', 'Low-level & external', 'Fans & heating', 'Control', 'Power', 'Data, AV & security'];

/** Standard components that moved category: code -> [old, new]. Projects still on the old one are moved. */
export const CATEGORY_MOVES: Record<string, [string, string]> = { FAN: ['Low-level & external', 'Fans & heating'], EXF: ['Power', 'Fans & heating'], HTR: ['Power', 'Fans & heating'] };

const natural = new Intl.Collator('en', { numeric: true, sensitivity: 'base' });

/** Sort by category (in CATEGORY_ORDER), then code in natural order (DL1, DL3 … DL9, DL10). */
export function compareComponents(a: Component, b: Component) {
  const ia = CATEGORY_ORDER.indexOf(a.category), ib = CATEGORY_ORDER.indexOf(b.category);
  const ca = ia < 0 ? 999 : ia, cb = ib < 0 ? 999 : ib;
  if (ca !== cb) return ca - cb;
  if (ca === 999 && a.category !== b.category) return natural.compare(a.category, b.category);
  return natural.compare(a.code, b.code);
}
