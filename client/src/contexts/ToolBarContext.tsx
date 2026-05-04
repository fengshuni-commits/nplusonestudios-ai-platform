import { createContext, useContext, useState, useCallback, useEffect } from "react";

type ToolBarContextType = {
  toolBar: React.ReactNode;
  setToolBar: (content: React.ReactNode) => void;
};

const ToolBarContext = createContext<ToolBarContextType>({
  toolBar: null,
  setToolBar: () => {},
});

export function ToolBarProvider({ children }: { children: React.ReactNode }) {
  const [toolBar, setToolBarState] = useState<React.ReactNode>(null);
  const setToolBar = useCallback((content: React.ReactNode) => {
    setToolBarState(content);
  }, []);
  return (
    <ToolBarContext.Provider value={{ toolBar, setToolBar }}>
      {children}
    </ToolBarContext.Provider>
  );
}

export function useToolBar() {
  return useContext(ToolBarContext);
}

/**
 * Hook for pages to inject content into the DashboardLayout toolbar.
 * Clears the toolbar when the component unmounts.
 */
export function useSetToolBar(content: React.ReactNode) {
  const { setToolBar } = useToolBar();
  useEffect(() => {
    setToolBar(content);
    return () => setToolBar(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
