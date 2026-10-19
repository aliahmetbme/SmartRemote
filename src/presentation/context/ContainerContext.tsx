import React, { createContext, useContext, useMemo, ReactNode } from 'react';
import { AppContainer, createProductionContainer } from '../../di/container';

const ContainerContext = createContext<AppContainer | null>(null);

let defaultProductionContainer: AppContainer | null = null;

function getProductionContainer(): AppContainer {
  if (!defaultProductionContainer) {
    defaultProductionContainer = createProductionContainer();
  }
  return defaultProductionContainer;
}

export interface ContainerProviderProps {
  container?: AppContainer;
  children: ReactNode;
}

/**
 * Dependency Injection Provider for presentation layer.
 * Ensures use cases and services are initialized once and not recreated across re-renders.
 */
export const ContainerProvider: React.FC<ContainerProviderProps> = ({ container, children }) => {
  const activeContainer = useMemo(() => container ?? getProductionContainer(), [container]);

  return (
    <ContainerContext.Provider value={activeContainer}>
      {children}
    </ContainerContext.Provider>
  );
};

export function useContainer(): AppContainer {
  const context = useContext(ContainerContext);
  if (!context) {
    throw new Error('useContainer must be used within a ContainerProvider');
  }
  return context;
}
