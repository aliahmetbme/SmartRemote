import React from 'react';
import { Text, View, Switch, StyleSheet } from 'react-native';
import { useAppDispatch, useAppSelector } from '../../store/hooks';
import { defaultMotionPreferences, remoteActions } from '../../store/slices/remoteSlice';
import { MotionCalibrationBar } from './MotionCalibrationBar';
import { MotionDiagnosticOverlay } from './MotionDiagnosticOverlay';
import { theme } from '../theme';

// Settings never creates a motion controller or starts sensor sampling.
export const MotionSettings = ({ section }: { section: 'preferences' | 'developer' }) => {
  const dispatch = useAppDispatch();
  const preferences = useAppSelector(state => state.remote.motionPreferences ?? defaultMotionPreferences);
  const data = useAppSelector(state => state.remote.motionDiagnosticData ?? null);
  const update = (values: Partial<typeof preferences>) => dispatch(remoteActions.motionPreferencesChanged(values));
  const storageFailed = useAppSelector(state => state.remote.preferencesStorageFailed);
  return <>
    {section === 'preferences' && <View style={styles.preferenceRow}>
      <Text style={{ color: theme.colors.textPrimary }}>Automatic Motion</Text>
      <Switch accessibilityLabel="Automatic Motion" testID="automatic-motion-toggle" value={preferences.automaticMotion !== false}
        onValueChange={automaticMotion => { update({ automaticMotion }); }} />
      {storageFailed && <Text style={{ color: theme.colors.textSecondary }}>Preferences apply now but could not be saved.</Text>}
    </View>}
    <MotionCalibrationBar section={section}
    sensitivity={preferences.sensitivity} onSensitivityChange={sensitivity => update({ sensitivity })}
    invertX={preferences.invertX} onToggleInvertX={() => update({ invertX: !preferences.invertX })}
    invertY={preferences.invertY} onToggleInvertY={() => update({ invertY: !preferences.invertY })}
    isDiagMode={preferences.diagnosticMode} onToggleDiag={() => update({ diagnosticMode: !preferences.diagnosticMode })}>
    {section === 'developer' && <>
      <Text style={{ color: theme.colors.textSecondary }}>Last Motion sample. Enable diagnostic mode, then use Motion to refresh. Diagnostic mode changes pointer response to raw input.</Text>
      <MotionDiagnosticOverlay data={data} />
    </>}
  </MotionCalibrationBar></>;
};

const styles = StyleSheet.create({ preferenceRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', minHeight: 48 } });
