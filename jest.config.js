module.exports = {
  preset: '@react-native/jest-preset',
  // Redux Toolkit and its deps ship ESM under the "react-native" condition.
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native|@react-native(-community)?|@react-navigation|@reduxjs/toolkit|immer|redux|redux-thunk|reselect|react-redux)/)',
  ],
};
