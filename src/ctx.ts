import React from 'react';
import type { User } from './api';

export const AppCtx = React.createContext<{ tick: number; user: User }>({ tick: 0, user: null as any });
export const useApp = () => React.useContext(AppCtx);
