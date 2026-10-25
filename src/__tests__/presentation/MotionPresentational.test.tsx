import React from 'react';
import ReactTestRenderer, { act } from 'react-test-renderer';
import { MotionCalibrationBar } from '../../presentation/components/MotionCalibrationBar';
import { MotionDiagnosticOverlay } from '../../presentation/components/MotionDiagnosticOverlay';

describe('MotionCalibrationBar (Presentational Component)', () => {
  it('renders sensitivity, axis toggles, and diagnostic toggle button', () => {
    let renderer: ReactTestRenderer.ReactTestRenderer;
    act(() => {
      renderer = ReactTestRenderer.create(
        <MotionCalibrationBar
          sensitivity={1.2}
          onSensitivityChange={() => {}}
          invertX={false}
          onToggleInvertX={() => {}}
          invertY={true}
          onToggleInvertY={() => {}}
          isDiagMode={false}
          onToggleDiag={() => {}}
        />
      );
    });

    expect(renderer!.root.findByProps({ testID: 'motion-sensitivity-value' })).toBeDefined();
    expect(renderer!.root.findByProps({ testID: 'motion-invert-x-toggle' })).toBeDefined();
    expect(renderer!.root.findByProps({ testID: 'motion-invert-y-toggle' })).toBeDefined();
    expect(renderer!.root.findByProps({ testID: 'motion-diag-toggle' })).toBeDefined();
  });

  it('triggers onSensitivityChange when +/- buttons are pressed', () => {
    const onSensitivityChange = jest.fn();
    let renderer: ReactTestRenderer.ReactTestRenderer;
    act(() => {
      renderer = ReactTestRenderer.create(
        <MotionCalibrationBar
          sensitivity={1.0}
          onSensitivityChange={onSensitivityChange}
          invertX={false}
          onToggleInvertX={() => {}}
          invertY={false}
          onToggleInvertY={() => {}}
          isDiagMode={false}
          onToggleDiag={() => {}}
        />
      );
    });

    const plusBtn = renderer!.root.findByProps({ testID: 'motion-sensitivity-plus' });
    plusBtn.props.onPress();
    expect(onSensitivityChange).toHaveBeenCalledWith(1.2);

    const minusBtn = renderer!.root.findByProps({ testID: 'motion-sensitivity-minus' });
    minusBtn.props.onPress();
    expect(onSensitivityChange).toHaveBeenCalledWith(0.8);
  });

  it('triggers inversion toggles and diag mode toggle', () => {
    const onToggleInvertX = jest.fn();
    const onToggleInvertY = jest.fn();
    const onToggleDiag = jest.fn();

    let renderer: ReactTestRenderer.ReactTestRenderer;
    act(() => {
      renderer = ReactTestRenderer.create(
        <MotionCalibrationBar
          sensitivity={1.0}
          onSensitivityChange={() => {}}
          invertX={false}
          onToggleInvertX={onToggleInvertX}
          invertY={false}
          onToggleInvertY={onToggleInvertY}
          isDiagMode={false}
          onToggleDiag={onToggleDiag}
        />
      );
    });

    const invertXBtn = renderer!.root.findByProps({ testID: 'motion-invert-x-toggle' });
    invertXBtn.props.onPress();
    expect(onToggleInvertX).toHaveBeenCalledTimes(1);

    const invertYBtn = renderer!.root.findByProps({ testID: 'motion-invert-y-toggle' });
    invertYBtn.props.onPress();
    expect(onToggleInvertY).toHaveBeenCalledTimes(1);

    const diagBtn = renderer!.root.findByProps({ testID: 'motion-diag-toggle' });
    diagBtn.props.onPress();
    expect(onToggleDiag).toHaveBeenCalledTimes(1);
  });
});

describe('MotionDiagnosticOverlay (Presentational Component)', () => {
  it('returns null when data is null', () => {
    let renderer: ReactTestRenderer.ReactTestRenderer;
    act(() => {
      renderer = ReactTestRenderer.create(<MotionDiagnosticOverlay data={null} />);
    });

    const card = renderer!.root.findAllByProps({ testID: 'motion-diag-card' });
    expect(card.length).toBe(0);
  });

  it('renders telemetry and diagnostics correctly when data is provided', () => {
    const mockData = {
      gyro: { x: 0.12, y: -0.45, z: 0.05 },
      gravity: { x: 0.01, y: 0.85, z: -0.52 },
      angularRates: { horizontal: 0.25, vertical: -0.15 },
      sampleRateHz: 60,
      sampleIntervalMs: 16,
      dispatchedRateHz: 58,
      pointerDelta: { dx: 12, dy: -8 },
      inversion: { invertX: false, invertY: false },
      diagnosticMode: true,
      pendingDelta: { dx: 0, dy: 0 },
    };

    let renderer: ReactTestRenderer.ReactTestRenderer;
    act(() => {
      renderer = ReactTestRenderer.create(<MotionDiagnosticOverlay data={mockData} />);
    });

    const card = renderer!.root.findByProps({ testID: 'motion-diag-card' });
    expect(card).toBeDefined();

    const title = card.findByProps({ children: 'LIVE AXIS DIAGNOSTICS (ACC & SMOOTH OFF)' });
    expect(title).toBeDefined();
  });
});
