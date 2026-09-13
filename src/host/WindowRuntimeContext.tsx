import { useEffect, useState } from 'react';
import { getNammuSDK, type LifecycleState } from '@nammu/sdk';

const initial: LifecycleState = {
  phase: 'active',
  visible: true,
  focused: true,
  active: true,
  suspended: false,
};

export function useWindowRuntime() {
  const [state, setState] = useState(initial);
  useEffect(() => {
    const sdk = getNammuSDK();
    void sdk.lifecycle.getState().then(setState);
    return sdk.lifecycle.onChange(setState);
  }, []);
  return {
    phase: state.phase,
    isActive: state.active,
    isBackground: !state.active && !state.suspended,
    isMinimized: state.phase === 'minimized',
    isInteracting: false,
    managedWindowId: null,
    zIndex: 0,
    shellOverlayActive: false,
    requestFocus: () => void getNammuSDK().window.focus(),
  };
}
