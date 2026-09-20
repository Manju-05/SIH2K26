---
name: Hydrographic Instrumentation Console
colors:
  surface: '#0d141e'
  surface-dim: '#0d141e'
  surface-bright: '#333a45'
  surface-container-lowest: '#080f18'
  surface-container-low: '#151c26'
  surface-container: '#19202a'
  surface-container-high: '#232a35'
  surface-container-highest: '#2e3540'
  on-surface: '#dce3f1'
  on-surface-variant: '#bdc8d1'
  inverse-surface: '#dce3f1'
  inverse-on-surface: '#2a313c'
  outline: '#87929a'
  outline-variant: '#3e484f'
  surface-tint: '#7bd0ff'
  primary: '#8ed5ff'
  on-primary: '#00354a'
  primary-container: '#38bdf8'
  on-primary-container: '#004965'
  inverse-primary: '#00668a'
  secondary: '#72d6d8'
  on-secondary: '#003738'
  secondary-container: '#339fa1'
  on-secondary-container: '#002f30'
  tertiary: '#56e5a9'
  on-tertiary: '#003824'
  tertiary-container: '#30c88f'
  on-tertiary-container: '#004e34'
  error: '#ffb4ab'
  on-error: '#690005'
  error-container: '#93000a'
  on-error-container: '#ffdad6'
  primary-fixed: '#c4e7ff'
  primary-fixed-dim: '#7bd0ff'
  on-primary-fixed: '#001e2c'
  on-primary-fixed-variant: '#004c69'
  secondary-fixed: '#8ff3f4'
  secondary-fixed-dim: '#72d6d8'
  on-secondary-fixed: '#002020'
  on-secondary-fixed-variant: '#004f51'
  tertiary-fixed: '#6ffbbe'
  tertiary-fixed-dim: '#4edea3'
  on-tertiary-fixed: '#002113'
  on-tertiary-fixed-variant: '#005236'
  background: '#0d141e'
  on-background: '#dce3f1'
  surface-variant: '#2e3540'
typography:
  headline-xl:
    fontFamily: Inter
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
    letterSpacing: -0.01em
  headline-lg:
    fontFamily: Inter
    fontSize: 18px
    fontWeight: '600'
    lineHeight: 24px
    letterSpacing: -0.005em
  headline-sm:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '600'
    lineHeight: 20px
    letterSpacing: 0em
  body-md:
    fontFamily: Inter
    fontSize: 13px
    fontWeight: '400'
    lineHeight: 18px
    letterSpacing: 0em
  body-sm:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '400'
    lineHeight: 16px
    letterSpacing: 0em
  mono-metric-xl:
    fontFamily: JetBrains Mono
    fontSize: 28px
    fontWeight: '600'
    lineHeight: 32px
    letterSpacing: -0.02em
  mono-metric-lg:
    fontFamily: JetBrains Mono
    fontSize: 18px
    fontWeight: '500'
    lineHeight: 22px
    letterSpacing: -0.01em
  mono-metric-md:
    fontFamily: JetBrains Mono
    fontSize: 13px
    fontWeight: '500'
    lineHeight: 16px
    letterSpacing: 0em
  label-caps:
    fontFamily: JetBrains Mono
    fontSize: 10px
    fontWeight: '700'
    lineHeight: 12px
    letterSpacing: 0.08em
  label-code:
    fontFamily: JetBrains Mono
    fontSize: 11px
    fontWeight: '400'
    lineHeight: 14px
    letterSpacing: 0em
spacing:
  gutter: 0.5rem
  margin: 0.75rem
  space-xs: 0.125rem
  space-sm: 0.25rem
  space-md: 0.5rem
  space-lg: 0.75rem
  space-xl: 1rem
---

## Brand & Style

This design system targets offshore survey engineers, hydrographers, and autonomous underwater vehicle (AUV/ROV) mission controllers operating in high-consequence, low-latency environments. The emotional posture is disciplined, mission-critical, and strictly functional: zero visual noise, immediate situational awareness, and total sensory clarity under variable bridge and telemetry shack lighting.

The aesthetic fuses **technical precision minimalism** with **aerospace-grade instrumentation density**. It completely discards consumer software tropes—no blurred backdrops, playful rounded edges, or decorative gradients. Visual weight is articulated through rigorous tabular geometries, hairline grid lines, and high-contrast status cues engineered for split-second legibility.

## Colors

The palette establishes an ultra-deep oceanic baseline using graphite and slate layers to prevent eye fatigue across multi-monitor bridge consoles.

### Core Canvas & Structure
- **Canvas Base (`#0B0F14`)**: Root canvas, background for multibeam sonar displays and spatial maps.
- **Instrument Surface (`#111822`)**: Standard panel, card, and telemetry module fill.
- **Surface Elevation High (`#182230`)**: Active row focus, modal dialogs, toolbar overlays, and raised switch wells.
- **Structural Border (`#223246`)**: Crisp 1px division lines maintaining panel boundary definitions without visual clutter.
- **Subtle Wire Border (`#1A2636`)**: Internal module subdivisions and table row grids.

### Signal & Accent Tones
- **Primary Signal (`#38bdf8`)**: Active radar/sonar ping markers, active telemetry channels, highlighted tracks.
- **Secondary Telemetry (`#38a3a5`)**: Subsea depth gradients, secondary sensor readouts, calibrated offsets.
- **Verified / Nominal (`#10b981`)**: GPS lock, transducer ping acknowledgment, normal operational status.
- **Advisory / Warning (`#f59e0b`)**: Cavitation warning, latency drift, degraded sound velocity profile.
- **Critical Fault / Hazard (`#ef4444`)**: Collision danger, thruster fail, bottom clearance proximity alert.

### Text & Metrics Contrast
- **Data High-Emphasis (`#F1F5F9`)**: Real-time readouts, latitude/longitude, depth values, critical labels.
- **Data Mid-Emphasis (`#94A3B8`)**: Axis markers, parameter titles, units of measure.
- **Disabled / Idle (`#475569`)**: Offline sensor feeds, inactive channels.

## Typography

The typography architecture uses a strict dual-font structure:
1. **Inter**: Serves operational copy, hierarchical structural headers, and command interfaces to guarantee fast spatial recognition.
2. **JetBrains Mono**: Serves all quantitative streams, raw sensor output, coordinate matrices, and status tokens. Its tabular figures guarantee that streaming numeric updates do not jitter or cause layout reflow.

All functional sensor labels and metadata categories leverage `label-caps` in uppercase with wide tracking (`0.08em`) to mimic physical chassis engraving and hardware instrument bezels.

## Layout & Spacing

The layout model is governed by high-density, multi-pane docking panels configured for 1080p, 1440p, and 4K ultra-wide bridge workstations.

### Grid Architecture
- **Docked Canvas**: Multi-panel modular CSS grid that prioritizes situational views (bathymetry, sidescan sonar waterfall, point-cloud visualization) alongside auxiliary telemetry sidecars.
- **Tightly Coupled Gutters**: Gutters are locked to 8px (`gutter: 0.5rem`) to eliminate dead space and preserve screen real estate for spatial mapping.
- **Compact Margins**: Outer shell margins are capped at 12px (`margin: 0.75rem`), docking cleanly against display bezels.

### Scaling & Responsive Reflow
- **Workstation / Multi-Display (>= 1920px)**: 4-column master view with unclipped real-time logs, chart plotters, and sensor matrices.
- **Ruggedized Field Laptop (1024px - 1440px)**: Collapses peripheral sensor readouts into tabbed sidebars; center display reserves 70% width for bathymetry and vehicle attitude indicators.
- **Field Tablet / Diagnostics (< 1024px)**: Single column stack, vertical accordion for data packets, touch targets enforce a minimum 40px hit area despite dense presentation.

## Elevation & Depth

This system rejects all drop shadows, ambient blurs, and glassmorphic translucent fills. In marine environments, glare and dynamic bridge lighting wash out subtle drop shadows, turning them into muddy visual noise.

Depth is achieved entirely through **low-contrast geometric containment and tonal surfaces**:
- **Layer 0 (Sea Bed / Map Background)**: `#0B0F14`
- **Layer 1 (Panel Workbenches)**: `#111822` defined by a solid `1px solid #223246` border.
- **Layer 2 (Module Wells & Insets)**: `#0B0F14` with an inset `1px solid #1A2636` border to denote receptive zones (chart viewports, command inputs).
- **Layer 3 (Modals & Command Overlays)**: `#182230` surrounded by a dual-tone hairline stroke (`1px solid #38BDF8` or `#223246`) to create definitive focal separation without drop shadows.

## Shapes

The design system enforces a technical corner radius of **2px** for inputs, buttons, and alert tags, and **0px** (flat sharp) for outer structural tiles and window splits. 

To maintain mechanical instrument styling:
- Radii are locked at `2px` maximum; large rounded curves are strictly prohibited.
- Sub-element segment selectors and split buttons nest seamlessly with shared hairline dividers (`1px solid #223246`).
- Indicators and directional arrows utilize sharp 45-degree and 90-degree geometric vectors.

## Components

### Buttons & Trigger Controls
- **Standard Action**: Background `#182230`, border `1px solid #223246`, text `#F1F5F9`, typography `label-code`, radius 2px. Hover state shifts border to `#38BDF8` and background to `#223246`.
- **Primary Execution (Ping / Calibrate)**: Background `#38BDF8`, text `#0B0F14`, font weight bold, border `1px solid #38BDF8`. Hover state dims to `#0284C7`.
- **Abort / Emergency Cut**: Background `#EF4444`, text `#FFFFFF`, border `1px solid #EF4444`. Pulsing state via CSS color shift (no blur animation).

### Metric Data Cards (Telemetry Cells)
- Containers feature `#111822` background, `1px solid #223246` border, and 2px radius.
- Header row contains the parameter title (`label-caps`, `#94A3B8`) and status dot (4px circle).
- Metric value uses `mono-metric-lg` or `mono-metric-xl` (`#F1F5F9`) paired with a baseline-aligned unit of measure (`label-code`, `#38A3A5`).

### Data Grids & Log Feeds
- Header rows utilize `#182230` background with bottom stroke `1px solid #223246`.
- Data rows alternate backgrounds: `#111822` and `#0E141D` with height locked to 28px for extreme data density.
- Numeric columns align right; status tags align center; alphanumeric strings align left.

### Status Badges & Alert Chips
- Height fixed at 18px; padding 0 6px; radius 2px.
- **Normal**: Background `rgba(16, 185, 129, 0.1)`, border `1px solid #10B981`, text `#10B981`, font `label-caps`.
- **Warning**: Background `rgba(245, 158, 11, 0.1)`, border `1px solid #F59E0B`, text `#F59E0B`, font `label-caps`.
- **Alert**: Background `rgba(239, 68, 68, 0.15)`, border `1px solid #EF4444`, text `#EF4444`, font `label-caps`.

### Inputs & Sensor Overrides
- Background `#0B0F14`, border `1px solid #223246`, text `#F1F5F9`, typography `JetBrains Mono` 12px.
- Focus state replaces the border with `1px solid #38BDF8` without outer glow rings.
- Checkboxes and toggles are square (14x14px), 0px radius, inner indicator rendered as a crisp 8x8px `#38BDF8` square when active.

### Hydrographic Specific: Waterfall & Sonar Readout Overlays
- Real-time stream overlays float directly on chart canvases using background `#111822` at 100% opacity, bordered by `1px solid #38A3A5`. Reticles use hairline `#38BDF8` crosshairs at 50% opacity.