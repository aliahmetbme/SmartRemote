/** Only served by the explicit SMARTREMOTE_SCREENSHOTS=1 development Metro command. */
import { AppRegistry, LogBox } from 'react-native';
import ScreenshotApp from './src/development/ScreenshotApp';
import { name } from './app.json';
if (!__DEV__) throw new Error('Screenshot fixtures must not run in Release');
// Fixture captures must not contain development warning overlays.
LogBox.ignoreAllLogs();
AppRegistry.registerComponent(name, () => ScreenshotApp);
