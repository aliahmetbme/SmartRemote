/**
 * @format
 */

import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import App from '../App';
import { createContainer } from '../src/di/container';

test('renders correctly', async () => {
  const container = createContainer();
  await ReactTestRenderer.act(() => {
    ReactTestRenderer.create(<App container={container} />);
  });
});
