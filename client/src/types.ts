export type SymbolKind =
  | 'downlight'
  | 'pinlight'
  | 'adjustable'
  | 'wall'
  | 'pendant'
  | 'linear'
  | 'strip'
  | 'lowlevel'
  | 'uplight'
  | 'spike'
  | 'spot'
  | 'panel'
  | 'surface'
  | 'fan'
  | 'keypad'
  | 'sensor'
  | 'touchscreen'
  | 'gpo'
  | 'usb'
  | 'gpo-wp'
  | 'data'
  | 'tv'
  | 'wap'
  | 'camera'
  | 'intercom'
  | 'speaker'
  | 'exhaust'
  | 'towel'
  | 'smoke'
  | 'circuit'
  | 'generic';

export type Control = 'DALI' | 'DALI relay' | 'Phase dim' | 'On/off' | 'Control device' | 'Power' | 'Low voltage' | 'Other';

export interface Component {
  code: string; // unique, e.g. DL1
  name: string;
  category: string;
  symbol: SymbolKind;
  color: string;
  control: Control;
  supplier: string;
  supplyRate: number; // $ ex GST per unit
  installRate: number; // $ ex GST per unit
  notes?: string;
}

export interface Room {
  id: string;
  name: string;
  dwelling: string; // e.g. "Dwelling 1", "Dwelling 2", "Common"
  points: number[]; // flat [x1,y1,x2,y2,...] in page points
}

export interface Item {
  id: string;
  code: string; // Component.code
  x: number; // page points, origin top-left
  y: number;
  rot: number; // degrees
  circuit?: string;
  layer?: string; // where it came from, e.g. "LA Lounge lighting"; undefined = drawn by hand
  note?: string;
}

export interface Axis {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface EraseRect {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface TextNote {
  id: string;
  x: number; // top-left, page points
  y: number;
  text: string;
  size: number; // font size, page points
  color: string;
  rot?: number;
  bold?: boolean;
}

export interface Floor {
  id: string;
  name: string;
  planId: string;
  page: number; // 1-based
  width: number; // page points
  height: number;
  mmPerPt?: number; // set by calibration
  axis?: Axis; // party-wall line for mirror copy
  importArea?: { x1: number; y1: number; x2: number; y2: number }; // the dwelling being modelled
  crop?: { x1: number; y1: number; x2: number; y2: number }; // visible part of the sheet
  rooms: Room[];
  items: Item[];
  erase?: EraseRect[]; // white-outs over the plan drawing
  texts?: TextNote[];
  bends?: Record<string, number>; // wire arc per linked pair (key from circuits.bendKey)
}

export interface ProjectData {
  schema: 1;
  dwellings: string[];
  symbolSize: number; // symbol radius in page points
  copies?: number; // identical dwellings built from this layout (default 2)
  hiddenLayers?: string[];
  library: Component[];
  floors: Floor[];
}

export interface ProjectSummary {
  id: string;
  name: string;
  version: number;
  updatedAt: string;
  updatedBy: string | null;
}

export interface Project extends ProjectSummary {
  data: ProjectData;
}

export interface PlanFile {
  id: string;
  projectId: string;
  fileName: string;
  size: number;
  uploadedAt: string;
}

export interface Revision {
  id: string;
  projectId: string;
  label: string;
  note: string | null;
  createdAt: string;
  createdBy: string | null;
}

export type Tool = 'select' | 'pan' | 'place' | 'room' | 'calibrate' | 'axis' | 'crop' | 'wire' | 'erase' | 'text';
